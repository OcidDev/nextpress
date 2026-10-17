import 'server-only'
import { compareVersions, parseStableVersion, type SemanticVersion } from './versions'

/** Repository the installation tracks. Configure the official fork in one place. */
export const releaseRepository = {
  owner: process.env.NEXTPRESS_RELEASE_OWNER?.trim() || 'OcidDev',
  name: process.env.NEXTPRESS_RELEASE_REPOSITORY?.trim() || 'nextpress',
} as const

export const releaseAssetName = 'nextpress-release.json'
export const releaseWorkflow = 'nextpress-release.yml'

/**
 * Node floor for the application itself. A release may raise it, never lower it:
 * an older runtime would build with syntax the server was never tested against.
 */
export const minimumNodeVersion: [number, number] = [22, 0]

export type ReleaseRequirements = {
  node: string
  packageManager: string
}

export type ReleaseManifest = {
  name: string
  version: string
  tag: string
  commit: string
  releasedAt: string
  notes: string
  requirements: ReleaseRequirements
  /** `false` when the release carries schema changes operators must apply after installing. */
  rollbackSafe: boolean
  migrations: { count: number; upto: string | null }
  source: { archive: string; sha256: string; bytes: number }
}

const sha256Pattern = /^[a-f0-9]{64}$/

/**
 * Validate a release manifest fetched from GitHub. Anything unexpected is a hard
 * failure: the update page must never present an unverified asset as installable.
 */
export function parseReleaseManifest(value: unknown): ReleaseManifest {
  if (!value || typeof value !== 'object') throw new Error('Manifest rilis tidak valid.')
  const data = value as Record<string, unknown>
  const fail = (field: string): never => {
    throw new Error(`Manifest rilis tidak valid: ${field}.`)
  }

  const version = typeof data.version === 'string' ? parseStableVersion(data.version) : undefined
  if (!version) fail('version')
  if (data.name !== 'nextpress') fail('name')
  if (typeof data.tag !== 'string') fail('tag')
  if (
    typeof data.tag !== 'string' ||
    parseStableVersion(data.tag) === undefined ||
    parseStableVersion(data.tag)!.major !== version!.major ||
    parseStableVersion(data.tag)!.minor !== version!.minor ||
    parseStableVersion(data.tag)!.patch !== version!.patch
  )
    fail('tag harus sama dengan version')
  if (typeof data.commit !== 'string' || !/^[0-9a-f]{40}$/.test(data.commit)) fail('commit')
  if (typeof data.releasedAt !== 'string' || Number.isNaN(Date.parse(data.releasedAt)))
    fail('releasedAt')
  if (typeof data.notes !== 'string') fail('notes')

  const requirements = data.requirements as Record<string, unknown> | undefined
  const node = typeof requirements?.node === 'string' ? parseStableVersion(requirements.node) : undefined
  if (!node) fail('requirements.node')
  if (node!.major < minimumNodeVersion[0]) fail('requirements.node minimal 22')
  if (typeof requirements?.packageManager !== 'string' || !requirements.packageManager.trim())
    fail('requirements.packageManager')

  if (typeof data.rollbackSafe !== 'boolean') fail('rollbackSafe')

  const migrations = data.migrations as Record<string, unknown> | undefined
  const count = migrations?.count
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) fail('migrations.count')
  const upto = migrations?.upto
  if (upto !== null && (typeof upto !== 'string' || !/^[a-z0-9_]+$/.test(upto)))
    fail('migrations.upto')

  const source = data.source as Record<string, unknown> | undefined
  const archive = typeof source?.archive === 'string' ? source.archive : ''
  if (!/^https:\/\//.test(archive)) fail('source.archive')
  const sha256 = typeof source?.sha256 === 'string' ? source.sha256 : ''
  if (!sha256Pattern.test(sha256)) fail('source.sha256')
  const bytes = typeof source?.bytes === 'number' ? source.bytes : 0
  if (!Number.isSafeInteger(bytes) || bytes <= 0) fail('source.bytes')

  return {
    name: 'nextpress',
    version: format(version!),
    tag: data.tag as string,
    commit: data.commit as string,
    releasedAt: data.releasedAt as string,
    notes: data.notes as string,
    requirements: {
      node: requirements!.node as string,
      packageManager: requirements!.packageManager as string,
    },
    rollbackSafe: data.rollbackSafe as boolean,
    migrations: { count: count as number, upto: upto as string | null },
    source: {
      archive,
      sha256,
      bytes,
    },
  }
}

function format(version: SemanticVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`
}

export type ReleaseListing = {
  manifest: ReleaseManifest
  /** GitHub release page, linked from admin but never used as a download URL. */
  htmlUrl: string
}

export type UpdateCheck =
  | { status: 'current'; checkedAt: string; installed: string }
  | {
      status: 'available'
      checkedAt: string
      installed: string
      latest: ReleaseManifest
      url: string
      compatible: boolean
      incompatibleReason?: string
    }

const releaseResponseLimit = 512 * 1024

/**
 * Ask GitHub for the newest stable release and validate its manifest asset.
 * The caller decides how to cache and degrade; this throws on any failure so a
 * cached "up to date" answer never masks a broken source.
 */
export async function fetchLatestRelease(installed: string): Promise<UpdateCheck> {
  const base = `https://api.github.com/repos/${releaseRepository.owner}/${releaseRepository.name}`
  // Optional token: only raises the anonymous rate limit, or enables checks
  // against a private repository. It never leaves the server.
  const token = process.env.NEXTPRESS_GITHUB_TOKEN?.trim()
  const githubHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': `nextpress/${installed}`,
  }
  if (token) githubHeaders.Authorization = `Bearer ${token}`
  const response = await fetch(`${base}/releases/latest`, {
    headers: githubHeaders,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (response.status === 404) throw new Error('Repositori rilis atau Release stabil belum tersedia.')
  if (response.status === 403 || response.status === 429)
    throw new Error('Batas permintaan GitHub tercapai. Coba lagi nanti.')
  if (!response.ok) throw new Error(`GitHub mengembalikan status ${response.status}.`)

  const body = (await response.json()) as {
    tag_name?: unknown
    html_url?: unknown
    assets?: { name?: unknown; browser_download_url?: unknown }[]
  }
  const parsed = typeof body.tag_name === 'string' ? parseStableVersion(body.tag_name) : undefined
  // A newer pre-release is published as a pre-release on GitHub, which the
  // /releases/latest endpoint already skips. A non-semver tag means the release
  // contract was broken; refuse to guess.
  if (!parsed) throw new Error('Tag Release terbaru bukan versi stabil semver.')

  const asset = body.assets?.find((item) => item.name === releaseAssetName)
  if (!asset || typeof asset.browser_download_url !== 'string')
    throw new Error(`Release tidak memuat ${releaseAssetName}.`)

  const manifestResponse = await fetch(asset.browser_download_url, {
    headers: { Accept: 'application/json', 'User-Agent': `nextpress/${installed}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!manifestResponse.ok) throw new Error('Manifest rilis tidak dapat diunduh.')
  const text = await manifestResponse.text()
  if (text.length > releaseResponseLimit) throw new Error('Manifest rilis terlalu besar.')
  const manifest = parseReleaseManifest(JSON.parse(text))
  if (compareVersions(parseStableVersion(manifest.version)!, parsed) !== 0)
    throw new Error('Manifest rilis tidak cocok dengan tag Release.')
  if (manifest.tag !== (body.tag_name as string))
    throw new Error('Manifest rilis tidak cocok dengan tag Release.')

  const checkedAt = new Date().toISOString()
  const latestVersion = parseStableVersion(manifest.version)!
  const current = parseStableVersion(installed)
  if (!current) throw new Error('Versi terpasang bukan semver stabil.')
  if (compareVersions(latestVersion, current) <= 0)
    return { status: 'current', checkedAt, installed }

  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number)
  const required = parseStableVersion(manifest.requirements.node)!
  const compatible =
    nodeMajor > required.major || (nodeMajor === required.major && nodeMinor >= required.minor)
  return {
    status: 'available',
    checkedAt,
    installed,
    latest: manifest,
    url: typeof body.html_url === 'string' ? body.html_url : '',
    compatible,
    incompatibleReason: compatible
      ? undefined
      : `Rilis memerlukan Node ${manifest.requirements.node}, server menjalankan Node ${nodeMajor}.${nodeMinor}.`,
  }
}
