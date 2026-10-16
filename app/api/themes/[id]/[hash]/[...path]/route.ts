import { readThemeAsset } from '@/lib/themes/manager'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; hash: string; path: string[] }> }) {
  const { id, hash, path } = await params
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(id) || !/^[a-f0-9]{64}$/.test(hash)) return new Response(null, { status: 404 })
  const asset = await readThemeAsset(id, hash, path.join('/'))
  if (!asset) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(asset.body), { headers: { 'Content-Type': asset.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
}
