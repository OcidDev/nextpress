import { cleanHtml, plainText } from './sanitize'

export type ArticleHeading = { id: string; text: string; level: 2 | 3 | 4 }

function decodeText(text: string) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[a-f0-9]+);/gi, (entity) => {
    const known: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&nbsp;': ' ',
    }
    const lower = entity.toLowerCase()
    if (known[lower]) return known[lower]
    const code = lower.startsWith('&#x')
      ? parseInt(lower.slice(3, -1), 16)
      : parseInt(lower.slice(2, -1), 10)
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : ''
  })
}

export function buildArticleContent(source: string): { html: string; headings: ArticleHeading[] } {
  const headings: ArticleHeading[] = []
  const ids = new Set<string>()
  const html = cleanHtml(source).replace(
    /<h([234])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi,
    (_, level: string, attributes: string | undefined, body: string) => {
      const align = attributes?.match(/style="text-align:\s*(left|center|right|justify)"/)?.[1]
      const style = align ? ` style="text-align:${align}"` : ''
      const text = decodeText(plainText(body))
      const slug = text
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 70)
      const base = `section-${slug || 'heading'}`
      let id = base
      let suffix = 2
      while (ids.has(id)) id = `${base}-${suffix++}`
      ids.add(id)
      if (text) headings.push({ id, text, level: Number(level) as ArticleHeading['level'] })
      return `<h${level} id="${id}"${style}>${body}</h${level}>`
    },
  )
  return { html, headings }
}

export function articlePlainText(source: string) {
  return decodeText(plainText(source))
}

export function escapedJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
