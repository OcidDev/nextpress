import app from '../../package.json'

/** The version compiled into this build. Releases must bump it before tagging. */
export const installedVersion: string = app.version

export type SemanticVersion = { major: number; minor: number; patch: number }

/**
 * Parse a release `vMAJOR.MINOR.PATCH` tag or manifest version. Pre-release and
 * build suffixes are rejected on purpose: the update page only ever offers stable
 * releases, so a tag such as `v1.2.0-rc.1` must not silently look installable.
 */
export function parseStableVersion(value: string): SemanticVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  if (!match) return undefined
  const [, major, minor, patch] = match
  return { major: Number(major), minor: Number(minor), patch: Number(patch) }
}

/** Positive when `a` is newer than `b`, zero when equal, negative when older. */
export function compareVersions(a: SemanticVersion, b: SemanticVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

export function formatVersion(version: SemanticVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`
}
