import { getCmsSession } from '@/lib/admin'
import { getPluginForRender } from '@/lib/db/queries/plugins'
import { getSettings } from '@/lib/db/queries/settings'
import { getAppearanceEditor } from '@/lib/db/queries/appearance'
import { pluginIdSchema } from '@/lib/plugins/manifest'
import { pluginFrameCsp, renderPluginFrame } from '@/lib/plugins/frame'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; widgetId: string }> },
) {
  const { id, widgetId } = await params
  if (!pluginIdSchema.safeParse(id).success || !pluginIdSchema.safeParse(widgetId).success)
    return new Response(null, { status: 404 })
  const preview = new URL(request.url).searchParams.get('preview') === '1'
  if (preview) {
    if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET)
      return new Response(null, { status: 401 })
    const session = await getCmsSession()
    if (!session || !session.user.capabilities.includes('activate_plugins') || !session.user.active)
      return new Response(null, { status: 401 })
  }
  const plugin = await getPluginForRender(id, preview)
  if (!plugin || !plugin.manifest.widgets.some((widget) => widget.id === widgetId))
    return new Response(null, { status: 404 })
  const site = preview ? (await getAppearanceEditor()).draft.config.site : await getSettings()
  const html = renderPluginFrame({
    ...plugin,
    widgetId,
    preview,
    site: { name: site.name, description: site.description },
  })
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': pluginFrameCsp,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
