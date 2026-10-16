import { createHmac } from 'node:crypto'
import { getAdminSession } from '@/lib/admin'
import { hasDatabase } from '@/lib/db'
import { getSettings } from '@/lib/db/queries/settings'
import { recordView } from '@/lib/db/queries/views'
import { viewInputSchema, viewRequestOrigin } from '@/lib/views'

export const runtime = 'nodejs'
const reply = (status: number) =>
  new Response(null, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  })
async function boundedBody(request: Request) {
  if (!request.body) throw new Error('Missing body')
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const item = await reader.read()
    if (item.done) break
    length += item.value.length
    if (length > 1024) {
      await reader.cancel()
      throw new Error('Body too large')
    }
    chunks.push(item.value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const expectedOrigin = viewRequestOrigin(
    request.url,
    request.headers.get('host'),
    request.headers.get('x-forwarded-proto'),
  )
  if (!origin || !expectedOrigin || origin !== expectedOrigin) return reply(403)
  if (
    request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
    'application/json'
  )
    return reply(415)
  let input
  try {
    input = viewInputSchema.parse(JSON.parse(await boundedBody(request)))
  } catch {
    return reply(400)
  }
  if (!hasDatabase() || !(await getSettings()).viewsEnabled) return reply(204)
  if (await getAdminSession()) return reply(204)
  if (/bot|crawler|spider|headless|preview/i.test(request.headers.get('user-agent') ?? ''))
    return reply(204)
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) return reply(503)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 200) || 'local'
  const hash = (value: string) => createHmac('sha256', secret).update(value).digest('hex')
  try {
    const result = await recordView({ ...input, ipHash: hash(ip), pathHash: hash(input.path) })
    return reply(
      result === 'missing'
        ? 404
        : result === 'limited'
          ? 429
          : result === 'unavailable'
            ? 503
            : 204,
    )
  } catch {
    return reply(503)
  }
}
