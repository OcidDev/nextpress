import { postPaths } from '@/lib/content/permalink-server'
import { getSettings } from '@/lib/db/queries/settings'
import type { MetadataRoute } from 'next'
import { siteConfig } from '@/data/site-config'
import { getPublicSitemapEntries } from '@/lib/db/queries/public'
import { getArchiveYears } from '@/lib/db/queries/posts'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [content, years] = await Promise.all([getPublicSitemapEntries(), getArchiveYears()])
  const settings = await getSettings()
  if (!settings.blogPublic) return []
  const paths = await postPaths(content.posts.map((post) => post.id))
  const absolute = (path: string) => new URL(path, siteConfig.url).href
  const postEntries = content.posts.map((post) => ({
    post,
    include: paths.has(post.id),
  }))
  const pageEntries = content.pages.map((page) => ({ page, include: true }))

  return [
    { url: absolute('/'), changeFrequency: 'daily' as const, priority: 1 },
    { url: absolute('/archive'), changeFrequency: 'weekly', priority: 0.5 },
    ...postEntries
      .filter((entry) => entry.include)
      .map(({ post }) => ({
        url: absolute(paths.get(post.id)!),
        lastModified: post.updatedAt || post.publishedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ...pageEntries
      .filter((entry) => entry.include)
      .map(({ page }) => page)
      .filter((page) => settings.showOnFront !== 'page' || page.id !== settings.pageOnFront)
      .map((page) => ({
        url: absolute(`/${page.slug}`),
        lastModified: page.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ...content.authors.map((author) => ({
      url: absolute(`/author/${author.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
    ...content.categories.map((category) => ({
      url: absolute(`/${settings.categoryBase || 'category'}/${category.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    ...years.map((year) => ({
      url: absolute(`/archive/${year.year}`),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
  ]
}
