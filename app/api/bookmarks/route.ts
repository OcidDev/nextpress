import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPublicPostSummariesByIds } from '@/lib/db/queries/posts'

export const dynamic = 'force-dynamic'
const idsSchema = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(200) }).strict()
const responseHeaders = { 'Cache-Control': 'private, no-store' }
export async function POST(request: Request) {
  if (
    request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
    'application/json'
  )
    return NextResponse.json(
      { error: 'Kirim daftar artikel dalam JSON.' },
      { status: 415, headers: responseHeaders },
    )
  const reader = request.body?.getReader()
  if (!reader)
    return NextResponse.json(
      { error: 'Daftar artikel tidak valid.' },
      { status: 400, headers: responseHeaders },
    )
  const decoder = new TextDecoder()
  let size = 0
  let body = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 8192) {
      await reader.cancel()
      return NextResponse.json(
        { error: 'Daftar artikel terlalu besar.' },
        { status: 413, headers: responseHeaders },
      )
    }
    body += decoder.decode(value, { stream: true })
  }
  body += decoder.decode()
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json(
      { error: 'Daftar artikel tidak valid.' },
      { status: 400, headers: responseHeaders },
    )
  }
  const parsed = idsSchema.safeParse(payload)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Daftar artikel tidak valid.' },
      { status: 400, headers: responseHeaders },
    )
  const items = await getPublicPostSummariesByIds(parsed.data.ids)
  return NextResponse.json({ items }, { headers: responseHeaders })
}
