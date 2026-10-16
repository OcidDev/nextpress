import { getRequestOptions } from '@/lib/core/options-server'
import { hasDatabase } from '@/lib/db'
import { siteConfig } from '@/data/site-config'
import { getPosts, getPostBySlug } from '@/lib/db/queries/posts'
import { getSettings } from '@/lib/db/queries/settings'

export const dynamic = 'force-dynamic'

function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  )
}

export async function GET() {
  const settings = await getSettings()
  const articles = await getPosts({ perPage: settings.postsPerRss })
  const bodies = settings.rssUseExcerpt
    ? []
    : await Promise.all(articles.items.map((post) => getPostBySlug(post.slug)))
  const guids = hasDatabase()
    ? await getRequestOptions().getOptions(
        articles.items.map((post) => `permalink:guid:${post.id}`),
      )
    : new Map()
  const absolute = (path: string) => new URL(path, siteConfig.url).href
  const items = articles.items
    .map(
      (post, index) =>
        `<item><title>${xml(post.title)}</title><link>${xml(absolute(post.permalink!))}</link><guid isPermaLink="true">${xml(absolute(String(guids.get(`permalink:guid:${post.id}`) || `/blog/${post.slug}`)))}</guid><description>${xml(settings.rssUseExcerpt ? post.excerpt : bodies[index]?.content || post.excerpt)}</description><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>${post.categories.map((category) => `<category>${xml(category.name)}</category>`).join('')}</item>`,
    )
    .join('')
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(settings.name)}</title><link>${xml(absolute('/'))}</link><description>${xml(settings.description)}</description><language>${siteConfig.language}</language><atom:link href="${xml(absolute('/feed.xml'))}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`
  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
