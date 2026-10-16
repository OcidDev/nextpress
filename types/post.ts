import type { Author } from './author'
import type { Category } from './category'

export type PostStatus = 'draft' | 'published' | 'scheduled'
export type PostLayout = 'default' | 'fullpage'

export interface TocItem {
  id: string
  text: string
  level: 2 | 3 | 4
  children: TocItem[]
}

export interface Post {
  id: string
  slug: string
  permalink?: string
  publishedLabel?: string
  updatedLabel?: string
  title: string
  excerpt: string
  /** HTML mentah hasil impor dari Blogger. */
  content: string
  /** Hasil pipeline rehype; hanya diisi saat render halaman artikel. */
  contentHtml?: string

  featuredImage?: string
  featuredImageAlt?: string
  /** Thumbnail berasal dari YouTube, bukan unggahan. */
  isYoutube: boolean

  author: Author
  categories: Category[]
  tags: string[]

  /** Menggantikan label ajaib Blogger (dulu label "Sponsored"). */
  isSponsored: boolean
  /** Dulu label "Product". */
  isProduct: boolean
  /** Dulu label "Fullpage". */
  layout: PostLayout
  allowComments: boolean
  showAds: boolean

  /** Menit; dihitung saat simpan, bukan di browser. */
  readingTime: number
  wordCount: number
  viewCount: number
  commentCount: number

  status: PostStatus
  publishedAt: string
  updatedAt?: string
  /** /YYYY/MM/judul.html — disimpan agar peta redirect bisa dibuat kapan saja. */
  legacyPath?: string
}

/** Bentuk ringkas untuk kartu di daftar artikel. */
export type PostSummary = Omit<Post, 'content' | 'contentHtml'>

export interface Page {
  id: string
  slug: string
  title: string
  content: string
  contentHtml?: string
  updatedAt?: string
}

export interface Paginated<T> {
  items: T[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface ArchiveMonth {
  month: number
  count: number
}

export interface ArchiveYear {
  year: number
  count: number
  months: ArchiveMonth[]
}
