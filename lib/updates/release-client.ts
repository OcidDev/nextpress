import { compareVersions, parseStableVersion } from './versions'
import { parseReleaseManifest, releaseCompatibility } from './manifest'
import type { ReleaseManifest } from './manifest'
import { downloadAsset, releaseAssetUrl, responseBytes } from './download'

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
  const manifest = await fetchRelease()
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
    url: `https://github.com/${releaseRepository.owner}/${releaseRepository.name}/releases/tag/${manifest.tag}`,
    ...releaseCompatibility(manifest),
  }
}

/** A queued job re-fetches its exact release; a newly published version cannot replace it. */
export async function fetchRelease(tag?: string): Promise<ReleaseManifest> {
  if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Tag rilis tidak valid.')
  if (
    ![releaseRepository.owner, releaseRepository.name].every((part) =>
      /^[A-Za-z0-9_.-]+$/.test(part),
    )
  )
    throw new Error('Repositori rilis tidak valid.')
  const base = `https://api.github.com/repos/${releaseRepository.owner}/${releaseRepository.name}`
  // Optional token: only raises the anonymous rate limit, or enables checks
  // against a private repository. It never leaves the server.
  const token = process.env.NEXTPRESS_GITHUB_TOKEN?.trim()
  const githubHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'nextpress-updater',
  }
  if (token) githubHeaders.Authorization = `Bearer ${token}`
  const response = await fetch(`${base}/releases/${tag ? `tags/${tag}` : 'latest'}`, {
    headers: githubHeaders,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (response.status === 404)
    throw new Error('Repositori rilis atau Release stabil belum tersedia.')
  if (response.status === 403 || response.status === 429)
    throw new Error('Batas permintaan GitHub tercapai. Coba lagi nanti.')
  if (!response.ok) throw new Error(`GitHub mengembalikan status ${response.status}.`)

  const body = JSON.parse(
    (await responseBytes(response, releaseResponseLimit)).toString('utf8'),
  ) as {
    tag_name?: unknown
    draft?: unknown
    prerelease?: unknown
    html_url?: unknown
    assets?: { name?: unknown; browser_download_url?: unknown }[]
  }
  const parsed = typeof body.tag_name === 'string' ? parseStableVersion(body.tag_name) : undefined
  // A newer pre-release is published as a pre-release on GitHub, which the
  // /releases/latest endpoint already skips. A non-semver tag means the release
  // contract was broken; refuse to guess.
  if (!parsed) throw new Error('Tag Release terbaru bukan versi stabil semver.')
  if (body.draft || body.prerelease || (tag && body.tag_name !== tag))
    throw new Error('Release stabil tidak cocok dengan permintaan.')

  const asset = body.assets?.find((item) => item.name === releaseAssetName)
  if (!asset || typeof asset.browser_download_url !== 'string')
    throw new Error(`Release tidak memuat ${releaseAssetName}.`)

  const expected = releaseAssetUrl(
    releaseRepository.owner,
    releaseRepository.name,
    String(body.tag_name),
    releaseAssetName,
  )
  if (asset.browser_download_url !== expected)
    throw new Error('Sumber manifest tidak cocok dengan repositori rilis.')
  const text = (await downloadAsset(expected, releaseResponseLimit)).toString('utf8')
  const manifest = parseReleaseManifest(JSON.parse(text))
  if (compareVersions(parseStableVersion(manifest.version)!, parsed) !== 0)
    throw new Error('Manifest rilis tidak cocok dengan tag Release.')
  if (manifest.tag !== (body.tag_name as string))
    throw new Error('Manifest rilis tidak cocok dengan tag Release.')

  const archiveName = `nextpress-${manifest.version}.tar.gz`
  const archiveUrl = releaseAssetUrl(
    releaseRepository.owner,
    releaseRepository.name,
    manifest.tag,
    archiveName,
  )
  if (
    manifest.source.archive !== archiveUrl ||
    !body.assets?.some(
      (item) => item.name === archiveName && item.browser_download_url === archiveUrl,
    )
  )
    throw new Error('Arsip rilis tidak cocok dengan repositori resmi.')
  return manifest
}
