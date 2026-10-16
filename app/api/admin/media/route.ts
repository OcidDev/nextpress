import { NextResponse } from 'next/server'
import { editorMedia } from '@/lib/db/queries/editor-media'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const rawPage = Number(url.searchParams.get('page') || '1')
  if (!Number.isInteger(rawPage) || rawPage < 1 || rawPage > 10000)
    return NextResponse.json({ error: 'Halaman tidak valid' }, { status: 400 })
  const result = await editorMedia(url.searchParams.get('q') || '', rawPage)
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}
