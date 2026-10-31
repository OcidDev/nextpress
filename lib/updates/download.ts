/** Bounded reads for both the web process and the independent update worker. */
export async function responseBytes(response: Response, limit: number): Promise<Buffer> {
  if (!response.ok || !response.body) throw new Error('Unduhan rilis gagal.')
  const advertised = Number(response.headers.get('content-length') || 0)
  if (advertised > limit) throw new Error('Unduhan rilis terlalu besar.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('Unduhan rilis terlalu besar.')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks, size)
}

export function releaseAssetUrl(owner: string, repo: string, tag: string, name: string) {
  return `https://github.com/${owner}/${repo}/releases/download/${tag}/${name}`
}

/** Only GitHub's release-asset redirect may follow a configured release URL. */
export async function downloadAsset(url: string, limit: number): Promise<Buffer> {
  let current = new URL(url)
  for (let redirects = 0; redirects < 4; redirects++) {
    if (
      current.protocol !== 'https:' ||
      current.username ||
      current.password ||
      current.port ||
      ![
        'github.com',
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
      ].includes(current.hostname)
    )
      throw new Error('Host aset rilis tidak diizinkan.')
    const response = await fetch(current, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
      headers: { Accept: 'application/octet-stream', 'User-Agent': 'nextpress-updater' },
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location) throw new Error('Redirect aset rilis tidak valid.')
      current = new URL(location, current)
      continue
    }
    return responseBytes(response, limit)
  }
  throw new Error('Terlalu banyak redirect aset rilis.')
}
