import { NextResponse } from 'next/server'
import { getCmsSession } from '@/lib/admin'
import { getAppearance, getAppearanceEditor } from '@/lib/db/queries/appearance'
import { getHomePostsPage } from '@/lib/db/queries/posts'
import { getViewStats } from '@/lib/db/queries/views'

export const dynamic = 'force-dynamic'
const responseHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const page = Number(params.get('page') || '1')
  const key = params.get('key') || ''
  if (!Number.isInteger(page) || page < 1 || page > 100000 || key.length > 1024)
    return NextResponse.json(
      { error: 'Halaman tidak valid.' },
      { status: 400, headers: responseHeaders },
    )
  const preview = params.get('preview') === '1'
  const session = await getCmsSession()
  if (preview && !session?.user.capabilities.includes('edit_theme_options'))
    return NextResponse.json(
      { error: 'Sesi admin diperlukan untuk preview.' },
      { status: 401, headers: responseHeaders },
    )
  const config = preview ? (await getAppearanceEditor()).draft.config : await getAppearance()
  const { collection, result, changed } = await getHomePostsPage(config, page, key)
  if (!collection.latest)
    return NextResponse.json(
      { error: 'Daftar artikel tidak tersedia.' },
      { status: 404, headers: responseHeaders },
    )
  if (changed)
    return NextResponse.json(
      { error: 'Daftar artikel telah berubah.' },
      { status: 409, headers: responseHeaders },
    )
  return NextResponse.json(
    {
      result,
      key: collection.key,
      options: {
        bookmarks: config.cards.bookmarks && !preview,
        showViews:
          config.cards.showViews && config.site.viewsEnabled && (await getViewStats()).available,
        editable:
          !preview &&
          config.cards.quickEdit &&
          Boolean(session?.user.capabilities.includes('manage_options')),
        preview,
      },
    },
    { headers: responseHeaders },
  )
}
