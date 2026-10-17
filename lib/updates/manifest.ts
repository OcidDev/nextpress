import { z } from 'zod'
import { parseStableVersion, type SemanticVersion } from './versions'

/**
 * Shape of the manifest asset published with every GitHub Release. It lives
 * apart from the fetching code so the option registry can validate the cached
 * copy on read without importing the GitHub client.
 */
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

/**
 * Node floor for the application itself. A release may raise it, never lower it:
 * an older runtime would build with syntax the server was never tested against.
 */
export const minimumNodeVersion: [number, number] = [22, 0]

const sha256Pattern = /^[a-f0-9]{64}$/

function format(version: SemanticVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`
}

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
  const rawTag = typeof data.tag === 'string' ? data.tag : fail('tag')
  const tag = parseStableVersion(rawTag)
  if (
    !tag ||
    tag.major !== version!.major ||
    tag.minor !== version!.minor ||
    tag.patch !== version!.patch
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

/**
 * Zod mirror of `parseReleaseManifest`, for values already stored in the
 * options table. It accepts the output shape and rejects what the fetcher would
 * have rejected; the fetcher stays the single authority for remote input.
 */
export const releaseManifestSchema = z.object({
  name: z.literal('nextpress'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  tag: z.string().regex(/^v?\d+\.\d+\.\d+$/),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  releasedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  notes: z.string(),
  requirements: z.object({
    node: z.string().regex(/^\d+\.\d+\.\d+$/),
    packageManager: z.string().min(1),
  }),
  rollbackSafe: z.boolean(),
  migrations: z.object({
    count: z.number().int().min(0),
    upto: z.string().regex(/^[a-z0-9_]+$/).nullable(),
  }),
  source: z.object({
    archive: z.string().url().startsWith('https://'),
    sha256: z.string().regex(sha256Pattern),
    bytes: z.number().int().positive(),
  }),
}) satisfies z.ZodType<ReleaseManifest>

/** Whether this server's Node runtime satisfies the release's Node floor. */
export function releaseCompatibility(manifest: ReleaseManifest) {
  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number)
  const required = parseStableVersion(manifest.requirements.node)!
  const compatible =
    nodeMajor > required.major || (nodeMajor === required.major && nodeMinor >= required.minor)
  return {
    compatible,
    incompatibleReason: compatible
      ? undefined
      : `Rilis memerlukan Node ${manifest.requirements.node}, server menjalankan Node ${nodeMajor}.${nodeMinor}.`,
  }
}
