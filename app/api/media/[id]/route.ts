import { publicMedia } from '@/lib/db/queries/media'
export const runtime = 'nodejs'
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const media = await publicMedia((await params).id)
  if (!media) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(media.data), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(media.size),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
