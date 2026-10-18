/**
 * Safe Google Blogger Atom Export XML Importer with XXE protection.
 */
import { slugify } from '@/lib/utils'

export interface BloggerImportItem {
  id?: string
  title: string
  slug: string
  content: string
  excerpt?: string
  status: 'published' | 'draft'
  type: 'post' | 'page'
  publishedAt: string
  updatedAt?: string
  categories: string[]
  authorName?: string
  originalUrl?: string
}

export interface BloggerImportSummary {
  totalProcessed: number
  importedCount: number
  skippedCount: number
  postsCount: number
  pagesCount: number
  dryRun: boolean
  items: BloggerImportItem[]
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function parseBloggerXml(
  xmlContent: string,
  dryRun = false,
  maxItems = 2000,
): BloggerImportSummary {
  // 1. XXE & XML Bomb protection
  if (xmlContent.includes('<!ENTITY') || xmlContent.includes('SYSTEM')) {
    throw new Error('Blogger XML ditolak: deteksi entitas XML berbahaya (XXE protection).')
  }

  const items: BloggerImportItem[] = []
  const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi
  let match: RegExpExecArray | null

  let postsCount = 0
  let pagesCount = 0

  while ((match = entryRegex.exec(xmlContent)) !== null) {
    const entryXml = match[1]!

    // Determine entry type (post, page, comment, template, settings)
    const isPost = /kind#post/i.test(entryXml)
    const isPage = /kind#page/i.test(entryXml)

    // Only import posts and static pages
    if (!isPost && !isPage) {
      continue
    }
    if (items.length >= maxItems)
      throw new Error(
        `Blogger maksimal ${maxItems} pos/laman. Pecah ekspor menjadi beberapa berkas.`,
      )

    const type: 'post' | 'page' = isPage ? 'page' : 'post'

    // Extract Title
    const titleMatch = entryXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)
    let rawTitle = titleMatch ? titleMatch[1]!.trim() : ''
    rawTitle = decodeXmlEntities(rawTitle)
    const title = rawTitle || (type === 'page' ? 'Halaman Tanpa Judul' : 'Artikel Tanpa Judul')

    // Extract Content
    const contentMatch = entryXml.match(
      /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i,
    )
    let content = contentMatch ? contentMatch[1]!.trim() : ''
    content = decodeXmlEntities(content)

    // Extract Published date
    const publishedMatch = entryXml.match(/<published>([\s\S]*?)<\/published>/i)
    const publishedAt = publishedMatch ? publishedMatch[1]!.trim() : new Date().toISOString()

    // Extract Updated date
    const updatedMatch = entryXml.match(/<updated>([\s\S]*?)<\/updated>/i)
    const updatedAt = updatedMatch ? updatedMatch[1]!.trim() : publishedAt

    // Extract Status (Draft vs Published)
    const isDraft = /<app:draft>\s*yes\s*<\/app:draft>/i.test(entryXml)
    const status: 'published' | 'draft' = isDraft ? 'draft' : 'published'

    // Extract Alternate Link & Slug
    const linkMatch =
      entryXml.match(/<link[^>]*rel=['"]alternate['"][^>]*href=['"]([^'"]+)['"]/i) ||
      entryXml.match(/<link[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]alternate['"]/i)
    const originalUrl = linkMatch ? linkMatch[1]!.trim() : undefined

    let slug = ''
    if (originalUrl) {
      try {
        const urlObj = new URL(originalUrl)
        const pathname = urlObj.pathname
        const filename = pathname.split('/').pop() || ''
        slug = filename.replace(/\.html?$/i, '')
      } catch {
        // fallback to slugify title
      }
    }

    if (!slug) {
      slug = slugify(title).slice(0, 150) || `blogger-${type}-${items.length + 1}`
    }

    // Extract Categories (labels)
    const categories: string[] = []
    const catRegex = /<category[^>]*scheme=['"][^'"]*atom\/ns#['"][^>]*term=['"]([^'"]+)['"]/gi
    let catMatch: RegExpExecArray | null
    while ((catMatch = catRegex.exec(entryXml)) !== null) {
      const term = decodeXmlEntities(catMatch[1]!.trim())
      if (term && !categories.includes(term)) {
        categories.push(term)
      }
    }

    // Extract Author
    const authorMatch = entryXml.match(
      /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i,
    )
    const authorName = authorMatch ? decodeXmlEntities(authorMatch[1]!.trim()) : undefined

    items.push({
      title,
      slug,
      content,
      status,
      type,
      publishedAt,
      updatedAt,
      categories,
      authorName,
      originalUrl,
    })

    if (type === 'post') {
      postsCount++
    } else {
      pagesCount++
    }
  }

  return {
    totalProcessed: items.length,
    importedCount: dryRun ? 0 : items.length,
    skippedCount: 0,
    postsCount,
    pagesCount,
    dryRun,
    items,
  }
}
