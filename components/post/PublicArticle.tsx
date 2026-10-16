import { SiteFrame } from '@/components/site/SiteFrame'
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
  const title = post.title
  const description = post.excerpt
  const url = new URL(post.permalink || `/blog/${post.slug}`, siteConfig.url).href
  const imageUrl = new URL(post.featuredImage || '/opengraph-image', siteConfig.url).href
  return {
    metadataBase: null,
    title,
    description,
    alternates: { canonical: url },
    robots: !settings.blogPublic ? { index: false, follow: true } : undefined,
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
    <SiteFrame>
      <ArticleContent post={post} />
    </SiteFrame>
  )
}
