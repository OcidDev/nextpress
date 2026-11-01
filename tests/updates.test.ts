import assert from 'node:assert/strict'
import { test, before, after, type TestContext } from 'node:test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync, gunzipSync } from 'node:zlib'
import { readReleaseArchive } from '../lib/updates/archive'
import { downloadAsset, responseBytes, releaseAssetUrl } from '../lib/updates/download'
import { fetchRelease, fetchLatestRelease, releaseRepository } from '../lib/updates/release-client'
import {
  parseReleaseManifest,
  releaseCompatibility,
  type ReleaseManifest,
} from '../lib/updates/manifest'
import { parseStableVersion } from '../lib/updates/versions'
import { vercelAdapter } from '../lib/updates/vercel-client'
import {
  installSelfHostedUpdate,
  runCommand,
  workerConfig,
  healthy,
  type WorkerConfig,
  type WorkerDependencies,
} from '../lib/updates/self-hosted-worker'

let fixture: string, archive: Buffer, release: ReleaseManifest
const journal = { version: '7', dialect: 'postgresql', entries: [{ tag: '0000_base', when: 1 }] }
before(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'nextpress-updater-fixture-'))
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim()
  git('init', '-q')
  await mkdir(join(fixture, 'drizzle/meta'), { recursive: true })
  await writeFile(
    join(fixture, 'package.json'),
    JSON.stringify({ name: 'nextpress', version: '1.0.1', packageManager: 'pnpm@11.22.0' }),
  )
  await writeFile(join(fixture, 'LICENSE'), 'Fixture license')
  await writeFile(join(fixture, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0')
  await writeFile(join(fixture, 'drizzle/meta/_journal.json'), JSON.stringify(journal))
  await writeFile(join(fixture, 'drizzle/0000_base.sql'), 'select 1;')
  git('add', '.')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Fixture release',
  )
  archive = gzipSync(execFileSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: fixture }))
  release = {
    name: 'nextpress',
    version: '1.0.1',
    tag: 'v1.0.1',
    commit: git('rev-parse', 'HEAD'),
    releasedAt: new Date().toISOString(),
    notes: 'Fixture update',
    requirements: { node: '22.0.0', packageManager: 'pnpm@11.22.0' },
    rollbackSafe: true,
    migrations: { count: 1, upto: '0000_base' },
    source: {
      archive: releaseAssetUrl(
        releaseRepository.owner,
        releaseRepository.name,
        'v1.0.1',
        'nextpress-1.0.1.tar.gz',
      ),
      bytes: archive.length,
      sha256: createHash('sha256').update(archive).digest('hex'),
    },
  }
})
after(async () => {
  await rm(fixture, { recursive: true, force: true })
})

test('real git release archive verifies checksum, commit, package version and lockfile', () => {
  assert.ok(readReleaseArchive(archive, release).some((item) => item.path === 'package.json'))
  assert.throws(() => readReleaseArchive(Buffer.from(archive).fill(0, 0, 1), release), /Checksum/)
  assert.throws(() => readReleaseArchive(archive, { ...release, commit: '0'.repeat(40) }), /commit/)
  assert.throws(() => readReleaseArchive(archive, { ...release, version: '1.0.2' }), /paket/)
  assert.throws(
    () =>
      readReleaseArchive(archive, {
        ...release,
        source: { ...release.source, bytes: archive.length + 1 },
      }),
    /Ukuran/,
  )
})

function maliciousArchive(path: string, type = '0') {
  const tar = gunzipSync(archive)
  let offset = 0
  while (tar[offset + 156] !== 48) {
    const size = Number.parseInt(
      tar
        .subarray(offset + 124, offset + 136)
        .toString()
        .replaceAll('\0', '')
        .trim(),
      8,
    )
    offset += 512 + Math.ceil(size / 512) * 512
  }
  tar.fill(0, offset, offset + 100)
  tar.write(path, offset)
  tar[offset + 156] = type.charCodeAt(0)
  tar.fill(32, offset + 148, offset + 156)
  const sum = tar.subarray(offset, offset + 512).reduce((a, b) => a + b, 0)
  tar.write(`${sum.toString(8).padStart(6, '0')}\0 `, offset + 148)
  const data = gzipSync(tar)
  return {
    data,
    manifest: {
      ...release,
      source: {
        ...release.source,
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      },
    },
  }
}
test('archive refuses traversal, absolute paths, secrets, symlinks and hardlinks', () => {
  for (const [path, type] of [
    ['../escape', '0'],
    ['/tmp/escape', '0'],
    ['.env.local', '0'],
    ['.git/config', '0'],
    ['link', '2'],
    ['hardlink', '1'],
  ]) {
    const { data, manifest } = maliciousArchive(path!, type)
    assert.throws(() => readReleaseArchive(data, manifest), /aman|biasa/)
  }
})

test('bounded downloads reject oversized streams and non-GitHub redirects', async (t) => {
  await assert.rejects(responseBytes(new Response('123456789'), 8), /besar/)
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }),
  )
  await assert.rejects(downloadAsset(release.source.archive, 100), /Host/)
})

function mockRelease(t: TestContext, overrides: Record<string, unknown> = {}, manifest = release) {
  const manifestUrl = releaseAssetUrl(
    releaseRepository.owner,
    releaseRepository.name,
    release.tag,
    'nextpress-release.json',
  )
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (String(url).startsWith('https://api.github.com/'))
      return Response.json({
        tag_name: release.tag,
        draft: false,
        prerelease: false,
        assets: [
          { name: 'nextpress-release.json', browser_download_url: manifestUrl },
          { name: 'nextpress-1.0.1.tar.gz', browser_download_url: release.source.archive },
        ],
        ...overrides,
      })
    assert.equal(String(url), manifestUrl)
    return Response.json(manifest)
  })
}
test('release client checks newer versions and re-fetches an exact queued tag', async (t) => {
  mockRelease(t)
  assert.equal((await fetchLatestRelease('1.0.0')).status, 'available')
  assert.equal((await fetchLatestRelease('1.0.1')).status, 'current')
  assert.equal((await fetchRelease('v1.0.1')).commit, release.commit)
  await assert.rejects(fetchRelease('v1.0.2'), /cocok/)
  await assert.rejects(fetchRelease('../main'), /Tag/)
})
test('release client refuses prereleases and a manifest pointing at another host', async (t) => {
  mockRelease(t, { prerelease: true })
  await assert.rejects(fetchRelease(), /stabil/)
  t.mock.restoreAll()
  mockRelease(
    t,
    {},
    { ...release, source: { ...release.source, archive: 'https://example.test/payload.tar.gz' } },
  )
  await assert.rejects(fetchRelease(), /Arsip/)
})
test('manifest rejects bad identity, checksum and mismatched tags', () => {
  assert.throws(() => parseReleaseManifest({ ...release, name: 'other' }), /name/)
  assert.throws(() => parseReleaseManifest({ ...release, tag: 'v2.0.0' }), /tag/)
  assert.throws(
    () => parseReleaseManifest({ ...release, source: { ...release.source, sha256: 'bad' } }),
    /sha256/,
  )
})

test('release compatibility honors Node patch versions and rejects unsafe version numbers or package managers', () => {
  const [major, minor, patch] = process.versions.node.split('.').map(Number)
  assert.equal(
    releaseCompatibility({
      ...release,
      requirements: { ...release.requirements, node: `${major}.${minor}.${patch! + 1}` },
    }).compatible,
    false,
  )
  assert.equal(parseStableVersion('999999999999999999999.0.0'), undefined)
  assert.throws(
    () =>
      parseReleaseManifest({
        ...release,
        requirements: { ...release.requirements, packageManager: 'pnpm@latest' },
      }),
    /packageManager/,
  )
})

test('Vercel uses the official release repository even when the installation is a separate clone', async (t) => {
  const saved = {
    token: process.env.VERCEL_TOKEN,
    project: process.env.VERCEL_PROJECT_ID,
    repo: process.env.VERCEL_REPO_ID,
  }
  process.env.VERCEL_TOKEN = 'fixture-token'
  process.env.VERCEL_PROJECT_ID = 'prj_fixture'
  process.env.VERCEL_REPO_ID = '999999'
  t.after(() => {
    for (const [name, value] of [
      ['VERCEL_TOKEN', saved.token],
      ['VERCEL_PROJECT_ID', saved.project],
      ['VERCEL_REPO_ID', saved.repo],
    ]) {
      if (value === undefined) delete process.env[name!]
      else process.env[name!] = value
    }
  })
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith('https://api.github.com/'))
      return Response.json({
        id: 12345,
        full_name: `${releaseRepository.owner}/${releaseRepository.name}`,
      })
    assert.ok(String(url).startsWith('https://api.vercel.com/v13/deployments'))
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.gitSource, {
      type: 'github',
      repoId: '12345',
      ref: release.tag,
      sha: release.commit,
    })
    assert.equal(body.project, 'prj_fixture')
    return Response.json({ id: 'dpl_fixture' })
  })
  assert.deepEqual(await vercelAdapter.missing(), [])
  assert.equal(
    (
      await vercelAdapter.start({
        jobId: 'a'.repeat(32),
        release,
        version: release.version,
        tag: release.tag,
        commit: release.commit,
      })
    ).externalId,
    'dpl_fixture',
  )
})

test('Vercel reports alias errors and returns the actual provider commit for final verification', async (t) => {
  const old = process.env.VERCEL_TOKEN
  process.env.VERCEL_TOKEN = 'fixture-token'
  t.after(() => {
    if (old === undefined) delete process.env.VERCEL_TOKEN
    else process.env.VERCEL_TOKEN = old
  })
  let failAlias = true
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      readyState: 'READY',
      gitSource: { sha: release.commit },
      aliasError: failAlias ? { code: 'failure', message: 'private provider data' } : null,
    }),
  )
  assert.deepEqual(await vercelAdapter.status('dpl_fixture'), {
    state: 'failed',
    detail: 'Alias produksi gagal dipasang di Vercel.',
  })
  failAlias = false
  const ready = await vercelAdapter.status('dpl_fixture')
  assert.equal(ready.state, 'ready')
  if (ready.state === 'ready') assert.equal(ready.commit, release.commit)
})
test('health check requires the requested version and commit', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      name: 'nextpress',
      version: release.version,
      commit: ++calls === 1 ? '0'.repeat(40) : release.commit,
    }),
  )
  assert.equal(await healthy('http://127.0.0.1:3109', release.version, release.commit), true)
  assert.equal(calls, 2)
})

async function installation(t: { after(fn: () => Promise<void>): void }, failure?: string) {
  const root = await mkdtemp(join(tmpdir(), 'nextpress-update-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const old = join(root, 'releases/initial')
  await mkdir(join(old, 'drizzle/meta'), { recursive: true })
  await mkdir(join(root, 'shared'))
  await writeFile(join(root, 'shared/.env.local'), 'DATABASE_URL=private-test-setting\n', {
    mode: 0o600,
  })
  await writeFile(
    join(old, 'package.json'),
    JSON.stringify({ name: 'nextpress', version: '1.0.0' }),
  )
  await writeFile(join(old, 'drizzle/meta/_journal.json'), JSON.stringify(journal))
  await writeFile(join(old, 'drizzle/0000_base.sql'), 'select 1;')
  const hashes: Record<string, string> = {}
  for (const path of ['package.json', 'drizzle/meta/_journal.json', 'drizzle/0000_base.sql'])
    hashes[path] = createHash('sha256')
      .update(await readFile(join(old, path)))
      .digest('hex')
  await writeFile(join(old, '.nextpress-source.json'), JSON.stringify(hashes))
  await symlink(old, join(root, 'current'))
  const config: WorkerConfig = {
    root,
    restart: [process.execPath, '-e', ''],
    origin: 'http://127.0.0.1:3109',
    env: { ...process.env, DATABASE_URL: 'private-test-setting' },
  }
  const steps: string[] = []
  let restarts = 0
  const dependencies: Partial<WorkerDependencies> = {
    release: async () => release,
    download: async () => readReleaseArchive(archive, release),
    run: async (cmd, args, cwd) => {
      const step = args[0] || ''
      steps.push(step)
      if (step === failure) throw new Error('Injected failure')
      if (step === 'scripts/backup-db.mjs')
        await writeFile(args[1]!, 'verified-backup-fixture'.repeat(10), { mode: 0o600 })
      if (step === 'build') assert.equal(await realpath(join(root, 'current')), old)
      if (cmd === config.restart[0] && step === '-e') {
        restarts++
        if (failure === 'restart' && restarts === 1) throw new Error('Restart failure')
        assert.equal(cwd, root)
      }
    },
    healthy: async (_origin, version) =>
      failure === 'rollback' ? false : failure === 'health' ? version === '1.0.0' : true,
  }
  const job = {
    id: 'a'.repeat(32),
    fromVersion: '1.0.0',
    toVersion: '1.0.1',
    tag: 'v1.0.1',
    commit: release.commit,
  }
  return { root, old, config, job, dependencies, steps }
}

test('worker installs into a separate directory, preserves settings/backup and switches only after build', async (t) => {
  const f = await installation(t)
  const result = await installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies)
  assert.equal(await realpath(join(f.root, 'current')), result.stage)
  assert.equal(
    await readFile(join(result.stage, '.env.local'), 'utf8'),
    'DATABASE_URL=private-test-setting\n',
  )
  assert.match(await readFile(result.backup, 'utf8'), /verified-backup/)
  assert.deepEqual(f.steps, [
    'install',
    'scripts/backup-db.mjs',
    '--list',
    'db:check',
    'build',
    '-e',
  ])
  assert.ok(await readFile(join(f.old, 'package.json')))
  await assert.rejects(readFile(join(f.root, 'updates/active/journal.json')), /ENOENT/)
})
for (const failure of ['install', 'scripts/backup-db.mjs', '--list', 'db:check', 'build']) {
  test(`worker leaves current release intact when ${failure} fails`, async (t) => {
    const f = await installation(t, failure)
    await assert.rejects(
      installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies),
      /Injected/,
    )
    assert.equal(await realpath(join(f.root, 'current')), f.old)
    assert.equal(f.steps.includes('-e'), false)
  })
}
for (const failure of ['restart', 'health']) {
  test(`worker restores old code after ${failure} failure and keeps the backup`, async (t) => {
    const f = await installation(t, failure)
    await assert.rejects(installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies))
    assert.equal(await realpath(join(f.root, 'current')), f.old)
    assert.ok(await readFile(join(f.root, 'backups', `${f.job.id}.dump`)))
    assert.equal(f.steps.filter((step) => step === '-e').length, 2)
  })
}
test('failed rollback keeps the recovery lock and prevents another install', async (t) => {
  const f = await installation(t, 'rollback')
  await assert.rejects(
    installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies),
    /dikunci/,
  )
  assert.ok(await readFile(join(f.root, 'updates/active/journal.json')))
  await assert.rejects(
    installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies),
    /EEXIST/,
  )
})
test('worker rejects changed releases, source edits, downgrades and schema-changing upgrades', async (t) => {
  const f = await installation(t)
  await assert.rejects(
    installSelfHostedUpdate(
      f.config,
      { ...f.job, toVersion: '0.9.0' },
      async () => {},
      f.dependencies,
    ),
    /lebih baru/,
  )
  await assert.rejects(
    installSelfHostedUpdate(
      f.config,
      { ...f.job, commit: '0'.repeat(40) },
      async () => {},
      f.dependencies,
    ),
    /berubah/,
  )
  await assert.rejects(
    installSelfHostedUpdate(f.config, f.job, async () => {}, {
      ...f.dependencies,
      release: async () => ({ ...release, rollbackSafe: false }),
    }),
    /skema/,
  )
  await writeFile(
    join(f.old, '.nextpress-source.json'),
    JSON.stringify({ 'package.json': '0'.repeat(64) }),
  )
  await assert.rejects(
    installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies),
    /lokal/,
  )
  assert.equal(await realpath(join(f.root, 'current')), f.old)
})
test('worker refuses skipped migrations even if the latest release is individually rollback-safe', async (t) => {
  const f = await installation(t)
  await writeFile(
    join(f.old, 'drizzle/meta/_journal.json'),
    JSON.stringify({ ...journal, entries: [] }),
  )
  const inventoryPath = join(f.old, '.nextpress-source.json')
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'))
  inventory['drizzle/meta/_journal.json'] = createHash('sha256')
    .update(await readFile(join(f.old, 'drizzle/meta/_journal.json')))
    .digest('hex')
  await writeFile(inventoryPath, JSON.stringify(inventory))
  await assert.rejects(
    installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies),
    /Rentang versi/,
  )
  assert.equal(f.steps.includes('build'), false)
})

test('worker refuses a different database and locally added source files before installing', async (t) => {
  const f = await installation(t)
  await assert.rejects(
    installSelfHostedUpdate(
      { ...f.config, env: { ...f.config.env, DATABASE_URL: 'other-database' } },
      f.job,
      async () => {},
      f.dependencies,
    ),
    /Database worker/,
  )
  await writeFile(join(f.old, 'custom-local.js'), 'local work')
  await assert.rejects(
    installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies),
    /source tambahan/,
  )
  assert.equal(f.steps.length, 0)
})
test('concurrent workers cannot both install into the same root', async (t) => {
  const f = await installation(t)
  let unlock!: () => void
  let entered!: () => void
  const waiting = new Promise<void>((resolve) => {
    unlock = resolve
  })
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const first = installSelfHostedUpdate(f.config, f.job, async () => {}, {
    ...f.dependencies,
    download: async () => {
      entered()
      await waiting
      return readReleaseArchive(archive, release)
    },
  })
  await started
  try {
    await assert.rejects(
      installSelfHostedUpdate(f.config, f.job, async () => {}, f.dependencies),
      /EEXIST/,
    )
  } finally {
    unlock()
  }
  await first
})
test('operator restart configuration is explicit argv; real command runner does not interpret shell syntax', async (t) => {
  assert.throws(
    () =>
      workerConfig({
        NODE_ENV: 'test',
        NEXTPRESS_UPDATE_ROOT: '/srv/test',
        NEXTPRESS_UPDATE_RESTART_ARGV: 'systemctl restart app',
      }),
    /argv/,
  )
  const root = await mkdtemp(join(tmpdir(), 'nextpress-command-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await runCommand(
    process.execPath,
    ['-e', 'console.log(process.argv[1])', '$(do-not-execute)'],
    root,
    process.env,
    join(root, 'command.log'),
  )
  assert.match(await readFile(join(root, 'command.log'), 'utf8'), /\$\(do-not-execute\)/)
})
