export function homeFeedKey(
  sectionId: string,
  limit: number,
  excludedIds: string[],
  fingerprint: string,
) {
  return `home-v2:${sectionId}:${limit}:${[...new Set(excludedIds)].sort().join(',')}:${fingerprint}`
}
