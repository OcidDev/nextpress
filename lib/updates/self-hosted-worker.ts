import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parseEnv } from 'node:util'
import {
  open,
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { ReleaseManifest } from './manifest'
import { releaseCompatibility } from './manifest'
import { fetchRelease } from './release-client'
import { downloadReleaseArchive, writeReleaseFiles } from './archive'
import { compareVersions, parseStableVersion } from './versions'

export type WorkerConfig = {
  root: string
  restart: string[]
  origin: string
  env: NodeJS.ProcessEnv
}
export type LocalUpdateJob = {
  id: string
  fromVersion: string
  toVersion: string
  tag: string
  commit: string
}
type Run = (
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  log: string,
) => Promise<void>
export type WorkerDependencies = {
  release: typeof fetchRelease
  download: typeof downloadReleaseArchive
  run: Run
  healthy: (origin: string, version: string, commit?: string) => Promise<boolean>
}

export function workerConfig(env = process.env): WorkerConfig {
  const root = env.NEXTPRESS_UPDATE_ROOT || ''
  if (!isAbsolute(root) || resolve(root) === '/')
    throw new Error('NEXTPRESS_UPDATE_ROOT harus direktori absolut khusus instalasi.')
  let restart: unknown
  try {
    restart = JSON.parse(env.NEXTPRESS_UPDATE_RESTART_ARGV || '')
  } catch {
    /* validated below */
  }
  if (
    !Array.isArray(restart) ||
    !restart.length ||
    !restart.every((arg) => typeof arg === 'string' && arg.length > 0 && !arg.includes('\0')) ||
    !isAbsolute(restart[0])
  )
    throw new Error(
      'NEXTPRESS_UPDATE_RESTART_ARGV harus array JSON argv dengan executable absolut.',
    )
  const origin = new URL(env.NEXT_PUBLIC_SITE_URL || '')
  if (
    origin.username ||
    origin.password ||
    (origin.protocol !== 'https:' &&
      !(
        origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      ))
  )
    throw new Error('Origin publik harus HTTPS (HTTP hanya untuk loopback).')
  return { root: resolve(root), restart, origin: origin.origin, env: { ...env } }
}

/** A command and arguments configured by the operator, never a shell string from a request. */
export const runCommand: Run = async (command, args, cwd, env, log) => {
  const output = await open(log, 'a', 0o600)
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env,
        shell: false,
        detached: true,
        stdio: ['ignore', output.fd, output.fd],
      })
      const timer = setTimeout(() => {
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            /* already exited */
          }
        }
      }, 20 * 60_000)
      child.once('error', () => {
        clearTimeout(timer)
        reject(new Error('Perintah worker tidak dapat dijalankan. Periksa log privat.'))
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error('Perintah worker gagal. Periksa log privat di server.'))
      })
    })
  } finally {
    await output.close()
  }
}

export async function healthy(origin: string, version: string, commit?: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(new URL('/api/version', origin), {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
      })
      const data = response.ok
        ? ((await response.json()) as { name?: unknown; version?: unknown; commit?: unknown })
        : null
      if (
        data?.name === 'nextpress' &&
        data.version === version &&
        (!commit || data.commit === commit)
      )
        return true
    } catch {
      /* restart may temporarily close the socket */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

export async function checkWorkerInstallation(config: WorkerConfig) {
  const { root } = config
  const current = join(root, 'current')
  if (!(await lstat(current)).isSymbolicLink())
    throw new Error('current harus symlink ke direktori rilis aktif.')
  const directory = await realpath(current)
  const app = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as {
    name?: string
    version?: string
  }
  if (app.name !== 'nextpress' || !app.version || !parseStableVersion(app.version))
    throw new Error('Direktori aktif bukan instalasi NextPress.')
  const shared = join(root, 'shared', '.env.local')
  if (!(await lstat(shared)).isFile())
    throw new Error('shared/.env.local harus berkas konfigurasi instalasi.')
  if ((await stat(shared)).mode & 0o077) throw new Error('Izin shared/.env.local harus 0600.')
  const sharedEnv = parseEnv(await readFile(shared, 'utf8'))
  if (!config.env.DATABASE_URL || sharedEnv.DATABASE_URL !== config.env.DATABASE_URL)
    throw new Error('Database worker harus sama dengan shared/.env.local.')
  await access(config.restart[0]!, 1)
  for (const folder of ['releases', 'backups', 'updates'])
    await mkdir(join(root, folder), { recursive: true, mode: 0o700 })
  return { directory, version: app.version, shared }
}

async function checkSourceInventory(directory: string, files: Record<string, string>) {
  const runtime = new Set([
    'node_modules',
    '.next',
    '.nextpress-source.json',
    'next-env.d.ts',
    'tsconfig.tsbuildinfo',
  ])
  async function walk(prefix = '') {
    for (const item of await readdir(join(directory, prefix), { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (
        !prefix &&
        (runtime.has(item.name) || (item.name.startsWith('.env') && item.name !== '.env.example'))
      )
        continue
      if (item.isSymbolicLink())
        throw new Error('Source core memuat symlink lokal. Periksa sebelum update.')
      if (item.isDirectory()) await walk(path)
      else if (!Object.hasOwn(files, path))
        throw new Error('Ada berkas source tambahan. Simpan perubahan sebelum update.')
    }
  }
  for (const [path, hash] of Object.entries(files)) {
    if (isAbsolute(path) || path.split('/').some((part) => !part || part === '..' || part === '.'))
      throw new Error('Inventaris source tidak valid.')
    const data = await readFile(join(directory, path))
    if (createHash('sha256').update(data).digest('hex') !== hash)
      throw new Error('Source core berubah secara lokal. Simpan perubahan sebelum update.')
  }
  await walk()
}

async function switchCurrent(root: string, target: string, id: string) {
  const temporary = join(root, `current-${id}`)
  await symlink(target, temporary, 'dir')
  await rename(temporary, join(root, 'current'))
}

/** Persisted before each destructive phase. A crashed worker leaves the lock/journal
 * in place for operator recovery; restarting must never repeat uncertain migrations. */
export async function installSelfHostedUpdate(
  config: WorkerConfig,
  job: LocalUpdateJob,
  progress: (message: string) => Promise<void>,
  dependencies: Partial<WorkerDependencies> = {},
) {
  const deps: WorkerDependencies = {
    release: fetchRelease,
    download: downloadReleaseArchive,
    run: runCommand,
    healthy,
    ...dependencies,
  }
  if (!/^[a-f0-9]{32}$/.test(job.id)) throw new Error('ID pekerjaan tidak valid.')
  const { root } = config
  const installation = await checkWorkerInstallation(config)
  const lock = join(root, 'updates', 'active')
  await mkdir(lock, { mode: 0o700 }) // EEXIST intentionally requires manual recovery after interruption.
  const stage = join(root, 'releases', `${job.toVersion}-${job.id}`)
  const log = join(root, 'updates', `${job.id}.log`)
  const backup = join(root, 'backups', `${job.id}.dump`)
  const journal = join(lock, 'journal.json')
  let switched = false
  let databaseChecked = false
  let release: ReleaseManifest | undefined
  let safeToUnlock = true
  const record = async (phase: string) => {
    const temp = join(lock, 'journal.tmp')
    await writeFile(
      temp,
      JSON.stringify({
        job,
        phase,
        previous: installation.directory,
        stage,
        backup,
        switched,
        databaseChecked,
      }),
      { mode: 0o600 },
    )
    await rename(temp, journal)
    await progress(phase)
  }
  try {
    await record('Memeriksa rilis dan instalasi')
    if (installation.version !== job.fromVersion)
      throw new Error('Versi instalasi berubah sejak pembaruan diminta.')
    const from = parseStableVersion(job.fromVersion),
      to = parseStableVersion(job.toVersion)
    if (!from || !to || compareVersions(to, from) <= 0)
      throw new Error('Pembaruan harus menuju versi yang lebih baru.')
    release = await deps.release(job.tag)
    if (
      release.version !== job.toVersion ||
      release.commit !== job.commit ||
      release.tag !== job.tag
    )
      throw new Error('Rilis berubah sejak pembaruan diminta.')
    if (!releaseCompatibility(release).compatible)
      throw new Error('Runtime Node tidak memenuhi persyaratan rilis.')
    if (!release.rollbackSafe)
      throw new Error('Perubahan skema memerlukan maintenance oleh operator.')
    // Existing clone edits must never disappear silently. Managed releases get a
    // source-file inventory on installation, verified before their next upgrade.
    const inventory = await readFile(
      join(installation.directory, '.nextpress-source.json'),
      'utf8',
    ).catch(() => null)
    if (inventory) {
      const files = JSON.parse(inventory) as Record<string, string>
      await checkSourceInventory(installation.directory, files)
    } else {
      // First adoption: git diff covers tracked and untracked source, excluding
      // ignored configuration/build artifacts. Output stays in the private log.
      await deps.run(
        process.execPath,
        [
          '-e',
          "const{execFileSync}=require('node:child_process');if(execFileSync('git',['status','--porcelain']).length)process.exit(1)",
        ],
        installation.directory,
        config.env,
        log,
      )
    }
    const disk = await statfs(root)
    if (disk.bavail * disk.bsize < 2 * 1024 ** 3)
      throw new Error('Ruang disk kosong minimal 2 GiB diperlukan, di luar ukuran backup database.')
    await record('Mengunduh dan memverifikasi paket rilis')
    const files = await deps.download(release)
    await mkdir(stage, { mode: 0o700 })
    await writeReleaseFiles(stage, files)
    const filesHash = Object.fromEntries(
      files.map((file) => [file.path, createHash('sha256').update(file.data).digest('hex')]),
    )
    await writeFile(join(stage, '.nextpress-source.json'), JSON.stringify(filesHash), {
      flag: 'wx',
      mode: 0o600,
    })
    await copyFile(installation.shared, join(stage, '.env.local'))
    await chmod(join(stage, '.env.local'), 0o600)
    const env = { ...config.env, NEXTPRESS_RELEASE_COMMIT: release.commit }
    await record('Memasang dependency di direktori rilis baru')
    // TypeScript, the worker launcher and build tooling are devDependencies;
    // production service environments must still install them for a source build.
    await deps.run('pnpm', ['install', '--frozen-lockfile', '--prod=false'], stage, env, log)
    await record('Membuat dan memverifikasi backup database')
    await deps.run(
      process.execPath,
      ['scripts/backup-db.mjs', backup],
      installation.directory,
      env,
      log,
    )
    if ((await stat(backup)).size < 16) throw new Error('Backup database kosong.')
    await deps.run('pg_restore', ['--list', backup], installation.directory, env, log)
    // rollbackSafe is relative to the previous official release. Refuse skipped
    // migrations by comparing the installed SQL files with the target inventory.
    const oldJournal = JSON.parse(
      await readFile(join(installation.directory, 'drizzle/meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string; when: number }[] }
    const newJournal = JSON.parse(
      await readFile(join(stage, 'drizzle/meta/_journal.json'), 'utf8'),
    ) as typeof oldJournal
    if (JSON.stringify(oldJournal) !== JSON.stringify(newJournal))
      throw new Error('Rentang versi ini mengubah migrasi. Maintenance operator diperlukan.')
    for (const item of oldJournal.entries) {
      const name = `drizzle/${item.tag}.sql`
      if (
        !(await readFile(join(installation.directory, name))).equals(
          await readFile(join(stage, name)),
        )
      )
        throw new Error('Migrasi rilis berubah. Maintenance operator diperlukan.')
    }
    await record('Memeriksa database dan membangun versi baru')
    await deps.run('pnpm', ['db:check'], stage, env, log)
    databaseChecked = true
    await deps.run('pnpm', ['build'], stage, env, log)
    if ((await realpath(join(root, 'current'))) !== installation.directory)
      throw new Error('Instalasi aktif berubah selama build.')
    await record('Mengaktifkan versi baru')
    // Record intent before rename; crash recovery must inspect the actual symlink.
    switched = true
    await record('Mengganti versi aktif dan restart')
    await switchCurrent(root, stage, job.id)
    await deps.run(config.restart[0]!, config.restart.slice(1), root, config.env, log)
    await record('Memeriksa versi dan commit yang melayani situs')
    if (!(await deps.healthy(config.origin, release.version, release.commit)))
      throw new Error('Versi baru gagal pemeriksaan kesehatan.')
    await record('Selesai; backup dan versi sebelumnya tetap tersedia')
    return { backup, stage }
  } catch (error) {
    // Errors and subprocess output stay in a mode-0600 server-side log, never the dashboard.
    const output = await open(log, 'a', 0o600)
    try {
      await output.write(`\n${error instanceof Error ? error.stack : 'Pembaruan gagal.'}\n`)
    } finally {
      await output.close()
    }
    if (switched) {
      try {
        await switchCurrent(root, installation.directory, `${job.id}-rollback`)
        await deps.run(config.restart[0]!, config.restart.slice(1), root, config.env, log)
        if (!(await deps.healthy(config.origin, installation.version)))
          throw new Error('Rollback tidak sehat.')
        await record('Pembaruan gagal; kode sebelumnya sudah kembali melayani')
      } catch {
        safeToUnlock = false
        throw new Error(
          'Pembaruan dan pemulihan kode memerlukan pemeriksaan operator. Worker dikunci; backup tetap tersedia.',
        )
      }
    }
    throw error
  } finally {
    // Keep an audit record, but never remove a backup or release directory.
    if (safeToUnlock) {
      await copyFile(journal, join(root, 'updates', `${job.id}.json`)).catch(() => {})
      await rm(lock, { recursive: true })
    }
  }
}
