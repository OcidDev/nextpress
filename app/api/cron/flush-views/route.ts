import { timingSafeEqual } from 'node:crypto'
import { flushViews } from '@/lib/db/queries/views'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    supplied = request.headers.get('authorization')
  if (!secret || secret.length < 16 || !supplied) return new Response(null, { status: 401 })
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(supplied)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return new Response(null, { status: 401 })
  try {
    const result = await flushViews()
    return Response.json(result, {
      status: result.available ? 200 : 503,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    })
  } catch {
    return Response.json(
      { error: 'Penghitung belum dapat disimpan.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    )
  }
}
