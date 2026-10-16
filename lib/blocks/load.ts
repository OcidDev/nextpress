import { effectiveContentSeo } from '@/lib/plugins/content-seo-server'
import 'server-only'

import type { Appearance } from '@/lib/content/appearance'
import { buildArticleContent } from '@/lib/content/article'
import { getAppearance } from '@/lib/db/queries/appearance'
import { getArticleNeighbors } from '@/lib/db/queries/related-posts'
import { applyFilters } from '@/lib/extensions/hooks'
import { bootExtensions } from '@/lib/extensions/bootstrap'
import { siteConfig } from '@/data/site-config'
import type { Post } from '@/types'
import { shareUrlFor, type BlockContext, type BlockArchiveContext } from './context'
/**
 * Pembangun konteks blok (sprint EXT-03).
 *
 * Satu-satunya berkas di `lib/blocks/` yang menyentuh database. Semua blok lain
 * menerima datanya lewat konteks, jadi tidak ada logika query yang terduplikasi
 * antara halaman biasa dan template tema: fungsi di bawah memanggil query yang
 * sama (`getAppearance`, `getArticleNeighbors`, `applyFilters('the_title')`) yang
 * sudah dipanggil `ArticleContent` dan halaman arsip.
 *
 * Berkas ini juga `server-only`: renderer dan definisi blok tetap murni dan dapat
 * diuji tanpa database, sementara penyambungannya ke data nyata dikumpulkan di
 * sini.
 */

/**
 * Konteks untuk halaman artikel. Urutan langkahnya sengaja sama dengan
 * `ArticleContent`: boot ekstensi, lalu filter judul, lalu tetangga artikel —
 * supaya halaman dan template tidak dapat melihat data yang berbeda.
 */
export async function articleBlockContext(
  post: Post,
  { preview = false, appearance }: { preview?: boolean; appearance?: Appearance } = {},
): Promise<BlockContext> {
  const config = appearance ?? (await getAppearance())
  await bootExtensions()
  const title = await applyFilters('the_title', post.title)
  // Preview tidak menyentuh artikel lain: artikel terkait ditampilkan pada artikel
  // publik, sama seperti perilaku `ArticleContent`.
  const neighbors = preview ? { related: [] } : await getArticleNeighbors(post)
  return {
    site: config.site,
    appearance: config,
    preview,
    post: {
      post,
      title,
      content: buildArticleContent(post.content),
      shareUrl: shareUrlFor(post, siteConfig.url, await effectiveContentSeo(post.seo)),
      related: { items: neighbors.related },
    },
  }
}

/** Konteks untuk halaman berisi daftar artikel (beranda, kategori, arsip, pencarian). */
export async function archiveBlockContext({
  preview = false,
  appearance,
  ...archive
}: Omit<BlockArchiveContext, 'appearance'> & {
  preview?: boolean
  appearance?: Appearance
}): Promise<BlockContext> {
  const config = appearance ?? (await getAppearance())
  return { site: config.site, appearance: config, preview, archive }
}

/** Konteks minimum tanpa artikel maupun arsip, untuk template seperti halaman statis. */
export async function siteBlockContext({
  preview = false,
  appearance,
}: { preview?: boolean; appearance?: Appearance } = {}): Promise<BlockContext> {
  const config = appearance ?? (await getAppearance())
  return { site: config.site, appearance: config, preview }
}
