import type { SEO } from '@/types/post'
import type { ReactNode } from 'react'
import type { Appearance, AppearanceSite } from '@/lib/content/appearance'
import type { ArticleHeading } from '@/lib/content/article'
import type { ArticleLink } from '@/lib/db/queries/related-posts'
import type { Paginated, Post, PostSummary } from '@/types'

/**
 * Konteks render blok (sprint EXT-03).
 *
 * Blok **tidak** mengambil datanya sendiri. Seluruh data yang dibutuhkan sebuah
 * pohon blok datang lewat satu objek ini, yang dibangun sekali per request oleh
 * `lib/blocks/load.ts` memakai query yang sudah dipakai halaman biasa. Dua
 * alasan:
 *
 * - Tidak ada logika query yang terduplikasi. Halaman dan template tema membaca
 *   jalur data yang sama, jadi keduanya tidak dapat menyimpang.
 * - Blok tetap dapat diuji tanpa database: unit test cukup menyusun objek ini,
 *   seperti kernel ekstensi diuji tanpa server.
 *
 * Isi konteks bergantung halaman yang dirender: halaman artikel mengisi `post`,
 * halaman arsip mengisi `archive`, dan keduanya mengisi `site`. Blok yang
 * konteksnya tidak ada merender `null` — bukan galat — karena template `index`
 * yang sama boleh dipakai di halaman yang tidak punya artikel.
 */

/** Data satu artikel untuk blok `core/post-*`. */
export type BlockPostContext = {
  post: Post
  /**
   * Judul setelah filter `the_title` (EXT-01). Blok judul memakai ini; metadata,
   * `alt`, dan tautan berbagi tetap memakai `post.title` mentah — sama seperti
   * `ArticleContent`.
   */
  title: string
  /** Hasil `buildArticleContent`: HTML tersanitasi + daftar heading artikel. */
  content: { html: string; headings: ArticleHeading[] }
  /** URL absolut untuk tombol berbagi. Lihat `shareUrlFor`. */
  shareUrl: string
  /**
   * Artikel terkait untuk `core/related-posts`, dari `getArticleNeighbors` yang
   * sama dengan halaman artikel. Kosong saat preview.
   *
   * Artikel sebelumnya/berikutnya dari query yang sama sengaja **tidak** dibawa:
   * belum ada blok yang merendernya (lihat catatan celah di sprint EXT-03), dan
   * membawa data yang tidak dibaca siapa pun hanya menambah tebakan bagi penulis
   * tema berikutnya.
   */
  related: { items: ArticleLink[] }
}

/** URL absolut artikel, dipakai tautan berbagi. Sama dengan perhitungan di halaman. */
export function shareUrlFor(post: Post, siteUrl: string, seo?: SEO) {
  return seo?.canonical || new URL(post.permalink || `/blog/${post.slug}`, siteUrl).href
}

/** Data satu halaman daftar artikel untuk blok `core/post-list` dan `core/pagination`. */
export type BlockArchiveContext = {
  /** Dedicated posts page selected in Reading, distinct from the static front page. */
  postsPage?: boolean
  result: Paginated<PostSummary>
  /** Basis tautan paginasi (`/`, `/blog`, `/category/berita`, …). */
  basePath?: string
  /** Query pencarian aktif; ikut dibawa ke tautan paginasi. */
  query?: string
  layout?: 'grid' | 'list'
  /** Membedakan kisi beranda dari kisi arsip — memengaruhi kelas CSS kartu. */
  context?: 'home' | 'archive'
  /** Diisi berarti daftar memakai "muat lagi" alih-alih tautan halaman. */
  feed?: { endpoint: string; key: string }
}

export type BlockContext = {
  page?: { id: string; title: string; content: string; pageTemplate: string }
  /** Existing route body during the template migration; no theme identity branching. */
  routeContent?: ReactNode
  /** Identitas situs (nama, logo, sosial, sakelar komentar). Selalu ada. */
  site: AppearanceSite
  /**
   * Konfigurasi tampilan penuh. Opsional: unit test boleh merendernya tanpa
   * konfigurasi; blok yang membutuhkannya lalu memakai nilai bawaannya.
   */
  appearance?: Appearance
  /** Preview di dasbor: tanpa pelacak tampilan, tanpa komentar nyata, tanpa edit cepat. */
  preview?: boolean
  post?: BlockPostContext
  archive?: BlockArchiveContext
}

/** Konteks minimum yang selalu tersedia, untuk blok yang tidak butuh apa-apa. */
export const emptyBlockContext = (site: AppearanceSite): BlockContext => ({ site })
