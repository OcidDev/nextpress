import { getSettings } from '@/lib/db/queries/settings'
export const dynamic = 'force-dynamic'
import type { MetadataRoute } from 'next'
import { siteConfig } from '@/data/site-config'

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!(await getSettings()).blogPublic) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin/', '/api/', '/preview/', '/search'] },
    sitemap: new URL('/sitemap.xml', siteConfig.url).href,
  }
}
