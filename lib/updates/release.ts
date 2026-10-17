import 'server-only'
import { compareVersions, parseStableVersion } from './versions'
import { parseReleaseManifest, releaseCompatibility } from './manifest'
import type { ReleaseManifest } from './manifest'

export type { ReleaseManifest, ReleaseRequirements } from './manifest'
export { parseReleaseManifest }

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

  return {
    status: 'available',
    checkedAt,
    installed,
    latest: manifest,
    url: typeof body.html_url === 'string' ? body.html_url : '',
    ...releaseCompatibility(manifest),
  }
}
