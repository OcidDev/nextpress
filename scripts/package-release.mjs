// Build a release archive and manifest from a git tag. Deterministic: the same
// commit always produces the same archive bytes, so the recorded sha256 can be
// verified by whoever downloads it.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import app from '../package.json' with { type: 'json' }

const tag = process.argv[2] || `v${app.version}`
const outputDir = resolve(process.argv[3] || 'dist')
const assetName = `nextpress-${app.version}.tar.gz`
const manifestName = 'nextpress-release.json'

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Tag rilis harus vMAJOR.MINOR.PATCH: ${tag}`)
if (tag !== `v${app.version}`)
  throw new Error(`Tag ${tag} tidak sama dengan version package.json (${app.version}).`)
if (git('status', '--porcelain')) throw new Error('Working tree kotor; rilis harus dibangun dari commit.')

const commit = git('rev-parse', 'HEAD')
const tagged = git('rev-list', '-n', '1', tag)
if (tagged !== commit)
  throw new Error(`Tag ${tag} menunjuk commit ${tagged}, bukan HEAD ${commit}. Checkout tag tersebut.`)

// Never ship installation data. Ignored files are excluded by git archive itself;
// this catches anything that was accidentally added and tracked.
const forbidden = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.local(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.next(\/|$)/,
  /(^|\/)(backups?|dumps?)(\/|$)/,
  /(^|\/)\.pem$/,
  /(^|\/)tsconfig\.tsbuildinfo$/,
]
// `.env.example` is the documented template; only real env files are forbidden.
const tracked = git('ls-tree', '-r', '--name-only', commit).split('\n')
const leaked = tracked
  .filter((path) => path !== '.env.example')
  .filter((path) => forbidden.some((pattern) => pattern.test(path)))
if (leaked.length) {
  console.error(`Path terlarang terlacak di ${commit}:`)
  for (const path of leaked) console.error(`  ${path}`)
  throw new Error('Hapus path tersebut dari git sebelum menerbitkan rilis.')
}

// gzip -n equivalent: no timestamp or filename in the header.
const tar = execFileSync('git', ['archive', '--format=tar', commit], { maxBuffer: 1024 * 1024 * 1024 })
const archive = gzipSync(tar, { level: 9 })
const sha256 = createHash('sha256').update(archive).digest('hex')
if (!gunzipSync(archive).equals(tar)) throw new Error('Arsip rilis tidak dapat dibaca ulang.')

const migrations = readdirSync(resolve('drizzle'))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()
const upto = migrations.at(-1)?.replace(/\.sql$/, '') ?? null

// A release is rollback-safe only when it adds no migration relative to the
// previous tag: code can go back, an applied schema change cannot.
let previous = ''
try {
  previous = execFileSync('git', ['describe', '--tags', '--abbrev=0', `${commit}^`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  // First release: every migration counts as new.
  previous = ''
}
let added = migrations.length
if (previous) {
  const before = git('ls-tree', '-r', '--name-only', previous, 'drizzle')
    .split('\n')
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  added = migrations.length - before.length
}

const repository = `${process.env.GITHUB_REPOSITORY || 'OcidDev/nextpress'}`
const manifest = {
  name: 'nextpress',
  version: app.version,
  tag,
  commit,
  releasedAt: new Date(Number(git('log', '-1', '--format=%ct', commit)) * 1000).toISOString(),
  notes: readFileSync(resolve('docs/releases', `${tag}.md`), 'utf8'),
  requirements: { node: '22.0.0', packageManager: app.packageManager },
  rollbackSafe: added === 0,
  migrations: { count: migrations.length, upto },
  source: {
    archive: `https://github.com/${repository}/releases/download/${tag}/${assetName}`,
    sha256,
    bytes: archive.length,
  },
}

mkdirSync(outputDir, { recursive: true })
writeFileSync(join(outputDir, assetName), archive)
writeFileSync(join(outputDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Rilis ${tag}`)
console.log(`  aset    ${assetName} (${archive.length} byte)`)
console.log(`  sha256  ${sha256}`)
console.log(`  migrasi ${migrations.length}${upto ? `, terakhir ${upto}` : ''}`)
console.log(`  rollbackSafe ${manifest.rollbackSafe}`)
