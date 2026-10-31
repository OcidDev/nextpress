import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { Pool } from 'pg'
import { readReleaseArchive } from '../lib/updates/archive'
import { healthy, installSelfHostedUpdate } from '../lib/updates/self-hosted-worker'
import type { ReleaseManifest } from '../lib/updates/manifest'

test(
  'system upgrade runs real install/build/backup commands and restarts a serving fixture without changing site data',
  { timeout: 120_000 },
  async () => {
    assert.ok(process.env.TEST_DATABASE_URL, 'Isolated TEST_DATABASE_URL with CREATEDB is required')
    const control = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
    const name = `nextpress_updater_${randomBytes(6).toString('hex')}`
    const url = new URL(process.env.TEST_DATABASE_URL)
    url.pathname = `/${name}`
    url.searchParams.delete('options')
    const db = new Pool({ connectionString: url.toString() })
    const root = await mkdtemp(join(tmpdir(), 'nextpress-updater-system-'))
    const old = join(root, 'releases/initial'),
      source = join(root, 'publisher')
    const pidFile = join(root, 'server.pid')
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    await new Promise<void>((resolve) => server.close(() => resolve()))
    const env = {
      ...process.env,
      DATABASE_URL: url.toString(),
      FIXTURE_PORT: String(port),
      FIXTURE_ROOT: root,
    }
    let created = false
    try {
      await control.query(`create database "${name}"`)
      created = true
      await db.query(
        "create table preserved_content(id int primary key, body text); insert into preserved_content values (1,'site content and settings survive')",
      )
      const packageJson = {
        name: 'nextpress',
        version: '1.0.1',
        type: 'module',
        packageManager: 'pnpm@11.22.0',
        scripts: { 'db:check': 'node check.mjs', build: 'node build.mjs' },
      }
      const files: Record<string, string> = {
        'package.json': JSON.stringify(packageJson),
        'pnpm-lock.yaml':
          "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n",
        LICENSE: 'Fixture only',
        'drizzle/meta/_journal.json': JSON.stringify({ entries: [] }),
        'scripts/postgres-env.mjs': await readFile(resolve('scripts/postgres-env.mjs'), 'utf8'),
        'scripts/backup-db.mjs': `import {spawnSync} from 'node:child_process';import {openSync,closeSync} from 'node:fs';import {postgresEnv} from './postgres-env.mjs';const fd=openSync(process.argv[2],'wx',0o600);const r=spawnSync('pg_dump',['--format=custom','--no-owner','--no-acl'],{env:{...process.env,...postgresEnv(process.env.DATABASE_URL)},stdio:['ignore',fd,'inherit']});closeSync(fd);if(r.status!==0)process.exit(1);`,
        'check.mjs': `import {spawnSync} from 'node:child_process';import {postgresEnv} from './scripts/postgres-env.mjs';const r=spawnSync('psql',['-Atc','select count(*) from preserved_content'],{env:{...process.env,...postgresEnv(process.env.DATABASE_URL)},encoding:'utf8'});if(r.status!==0||r.stdout.trim()!=='1')process.exit(1);`,
        'build.mjs': `import {readFileSync,writeFileSync} from 'node:fs';const app=JSON.parse(readFileSync('package.json'));writeFileSync('identity.json',JSON.stringify({name:app.name,version:app.version,commit:process.env.NEXTPRESS_RELEASE_COMMIT}));`,
        'server.mjs': `import {createServer} from 'node:http';import {readFileSync} from 'node:fs';const identity=readFileSync('identity.json');createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(identity)}).listen(Number(process.env.FIXTURE_PORT),'127.0.0.1');`,
      }
      for (const [path, text] of Object.entries(files)) {
        for (const directory of [old, source]) {
          const destination = join(directory, path)
          await mkdir(resolve(destination, '..'), { recursive: true })
          await writeFile(destination, text)
        }
      }
      await writeFile(
        join(old, 'package.json'),
        JSON.stringify({ ...packageJson, version: '1.0.0' }),
      )
      // First adoption uses a clean clone and exercises its real git status preflight.
      for (const directory of [old, source]) {
        await writeFile(join(directory, '.gitignore'), 'identity.json\n')
        execFileSync('git', ['init', '-q'], { cwd: directory })
        execFileSync('git', ['add', '.'], { cwd: directory })
        execFileSync(
          'git',
          [
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.test',
            'commit',
            '-qm',
            'Fixture release',
          ],
          { cwd: directory },
        )
      }
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: source,
        encoding: 'utf8',
      }).trim()
      const archive = gzipSync(
        execFileSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: source }),
      )
      const release: ReleaseManifest = {
        name: 'nextpress',
        version: '1.0.1',
        tag: 'v1.0.1',
        commit,
        releasedAt: new Date().toISOString(),
        notes: '',
        requirements: { node: '22.0.0', packageManager: packageJson.packageManager },
        rollbackSafe: true,
        migrations: { count: 0, upto: null },
        source: {
          archive:
            'https://github.com/fixture/nextpress/releases/download/v1.0.1/nextpress-1.0.1.tar.gz',
          bytes: archive.length,
          sha256: createHash('sha256').update(archive).digest('hex'),
        },
      }
      await mkdir(join(root, 'shared'))
      await writeFile(join(root, 'shared/.env.local'), `DATABASE_URL=${url.toString()}\n`, {
        mode: 0o600,
      })
      await writeFile(
        join(old, 'identity.json'),
        JSON.stringify({ name: 'nextpress', version: '1.0.0', commit: 'a'.repeat(40) }),
      )
      await symlink(old, join(root, 'current'))
      const child = spawn(process.execPath, ['server.mjs'], {
        cwd: old,
        env,
        detached: true,
        stdio: 'ignore',
      })
      assert.ok(child.pid)
      await writeFile(pidFile, String(child.pid))
      child.unref()
      assert.equal(await healthy(`http://127.0.0.1:${port}`, '1.0.0', 'a'.repeat(40)), true)
      const restart = join(root, 'restart.mjs')
      await writeFile(
        restart,
        `import{readFileSync,writeFileSync,realpathSync}from'node:fs';import{spawn}from'node:child_process';const root=process.env.FIXTURE_ROOT;process.kill(Number(readFileSync(root+'/server.pid')),'SIGTERM');await new Promise(r=>setTimeout(r,500));const child=spawn(process.execPath,['server.mjs'],{cwd:realpathSync(root+'/current'),env:process.env,detached:true,stdio:'ignore'});writeFileSync(root+'/server.pid',String(child.pid));child.unref();`,
      )
      const phases: string[] = []
      const result = await installSelfHostedUpdate(
        { root, restart: [process.execPath, restart], origin: `http://127.0.0.1:${port}`, env },
        {
          id: 'b'.repeat(32),
          fromVersion: '1.0.0',
          toVersion: release.version,
          tag: release.tag,
          commit,
        },
        async (phase) => {
          phases.push(phase)
        },
        {
          release: async () => release,
          download: async () => readReleaseArchive(archive, release),
        },
      )
      assert.equal(await realpath(join(root, 'current')), result.stage)
      assert.equal(await healthy(`http://127.0.0.1:${port}`, release.version, commit), true)
      assert.equal(
        (await db.query('select body from preserved_content')).rows[0].body,
        'site content and settings survive',
      )
      const backupContents = execFileSync('pg_restore', ['--list', result.backup], {
        encoding: 'utf8',
      })
      assert.match(backupContents, /TABLE DATA public preserved_content/)
      assert.ok(phases.includes('Membuat dan memverifikasi backup database'))
      assert.ok((await readFile(join(old, 'package.json'), 'utf8')).includes('1.0.0'))
    } finally {
      const pid = await readFile(pidFile, 'utf8').catch(() => '')
      if (pid) {
        try {
          process.kill(Number(pid), 'SIGTERM')
        } catch {
          /* already stopped */
        }
      }
      await db.end()
      if (created) await control.query(`drop database "${name}"`)
      await control.end()
      await rm(root, { recursive: true, force: true })
    }
  },
)
