import { getSettings } from '@/lib/db/queries/settings'
import { contentStructuredData } from '@/lib/plugins/content-seo-server'
import { escapedJsonLd } from '@/lib/content/article'
import { siteConfig } from '@/data/site-config'
import type { Post } from '@/types/post'

export async function ContentSeoSchema({ post }: { post: Post }) {
  const settings = await getSettings()
  const schema = await contentStructuredData(post, {
    ...siteConfig,
    name: settings.name,
    logo: settings.logo,
  })
  if (!schema) return null
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: escapedJsonLd(schema) }}
    />
  )
}
