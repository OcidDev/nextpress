import { effectiveContentSeo } from '@/lib/plugins/content-seo-server'
import type { SEO } from '@/types/post'
import 'server-only'
import type { Metadata } from 'next'
import { siteConfig } from '@/data/site-config'
import { getSettings } from '@/lib/db/queries/settings'
import { applyFilters } from '@/lib/extensions/hooks'
import { bootExtensions } from '@/lib/extensions/bootstrap'

export async function publicPageMetadata({
  title,
  description,
  path,
  page = 1,
  noIndex = false,
  absoluteTitle = false,
  keywords,
  seo: storedSeo,
}: {
  title?: string
  description?: string
  path: string
  page?: number
  noIndex?: boolean
  absoluteTitle?: boolean
  keywords?: string[]
  seo?: SEO | null
}): Promise<Metadata> {
  // Metadata dihasilkan per segmen halaman, dan pada navigasi sisi klien layout
  // akar tidak ikut dirender ulang — jadi kernel dimuat di sini juga.
  await bootExtensions()
  const settings = await getSettings()
  const seo = await effectiveContentSeo(storedSeo)
  const name = seo.title || title || settings.name
  // `document_title` (EXT-01) berjalan atas judul akhir, termasuk akhiran
  // "— Halaman N", supaya ekstensi dapat mengubah judul dokumen apa adanya.
  const pageTitle = await applyFilters(
    'document_title',
    page > 1 ? `${name} — Halaman ${page}` : name,
  )
  const summary = seo.description || description || settings.description
  const url = new URL(path, siteConfig.url)
  if (page > 1) url.searchParams.set('page', String(page))
  else url.searchParams.delete('page')
  const canonical = seo.canonical || url.href
  const image = new URL(seo.ogImage || '/opengraph-image', siteConfig.url).href
  return {
    // Next 15 reduces origin URLs to .origin when metadataBase is present,
    // removing the homepage pagination query. These URLs are already absolute.
    metadataBase: null,
    title: absoluteTitle ? { absolute: pageTitle } : pageTitle,
    description: summary,
    keywords: seo.keywords || keywords,
    alternates: {
      canonical,
      types: { 'application/rss+xml': new URL('/feed.xml', siteConfig.url).href },
    },
    robots:
      !settings.blogPublic || noIndex || seo.noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      title: pageTitle,
      description: summary,
      siteName: settings.name,
      locale: siteConfig.locale,
      url: canonical,
      images: [{ url: image, width: 1200, height: 630, alt: settings.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: summary,
      images: [image],
    },
  }
}
