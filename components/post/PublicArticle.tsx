import { effectiveContentSeo } from '@/lib/plugins/content-seo-server'
import { ContentSeoSchema } from '@/components/post/ContentSeoSchema'
import { articleBlockContext } from '@/lib/blocks/load'
import { ThemePage } from '@/lib/themes/ThemePage'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { siteConfig } from '@/data/site-config'
import { ArticleContent } from '@/components/post/ArticleContent'
import { getPostBySlug } from '@/lib/db/queries/posts'
import { getSettings } from '@/lib/db/queries/settings'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const post = await getPostBySlug((await params).slug)
  if (!post) return { title: 'Artikel tidak ditemukan', robots: { index: false } }
  const settings = await getSettings()
  const seo = await effectiveContentSeo(post.seo)
  const title = seo.title || post.title
  const description = seo.description || post.excerpt
  const url = seo.canonical || new URL(post.permalink || `/blog/${post.slug}`, siteConfig.url).href
  const image = seo.ogImage || post.featuredImage
  const imageUrl = new URL(image || '/opengraph-image', siteConfig.url).href
  return {
    metadataBase: null,
    title,
    description,
    keywords: seo.keywords,
    alternates: { canonical: url },
    robots: !settings.blogPublic || seo.noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      siteName: settings.name,
      url,
      locale: siteConfig.locale,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [post.author.name],
      tags: post.tags,
      images: [{ url: imageUrl, alt: post.featuredImageAlt || title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [imageUrl] },
  }
}

export default async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPostBySlug((await params).slug)
  if (!post) notFound()
  return (
    <>
      <ContentSeoSchema post={post} />
      <ThemePage
        query={{ kind: 'single', slug: post.slug, id: post.id }}
        context={await articleBlockContext(post)}
      >
        <ArticleContent post={post} />
      </ThemePage>
    </>
  )
}
