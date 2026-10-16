import { slugify } from '@/lib/utils'

export interface PermalinkConfig {
  timezone?: string
  structure: string // e.g. '/%year%/%monthnum%/%day%/%postname%/' or '/%postname%/' or '/blog/%postname%/'
  categoryBase?: string // default 'category'
  tagBase?: string // default 'tag'
  authorBase?: string // default 'author'
  pageBase?: string // default '' (root-relative)
}

export const DEFAULT_PERMALINK_CONFIG: PermalinkConfig = {
  structure: '/blog/%postname%',
  categoryBase: 'category',
  tagBase: 'tag',
  authorBase: 'author',
  pageBase: '',
}

export const RESERVED_SEGMENTS = new Set([
  'admin',
  'api',
  'wp-admin',
  'wp-json',
  'wp-login',
  'feed',
  'feed.xml',
  'sitemap',
  'sitemap.xml',
  'robots.txt',
  'favicon.ico',
  '_next',
  'static',
  'auth',
  'signin',
  'signup',
  'login',
  'logout',
  'dashboard',
])

export function normalizePath(path: string): string {
  if (!path) return '/'
  const trimmed = path.trim()
  if (!trimmed || trimmed === '/') return '/'
  const withoutTrailing = trimmed.replace(/\/+$/, '')
  if (!withoutTrailing) return '/'
  const clean = withoutTrailing.replace(/^\/+/, '/')
  return clean.startsWith('/') ? clean : `/${clean}`
}

/**
 * Formats a post's permalink according to the configured structure.
 */
export function formatPostPermalink(
  post: {
    slug: string
    id?: string
    publishedAt?: Date | string | null
    createdAt?: Date | string
    categorySlug?: string
    authorSlug?: string
  },
  config: PermalinkConfig = DEFAULT_PERMALINK_CONFIG,
): string {
  const template = config.structure || DEFAULT_PERMALINK_CONFIG.structure

  const date = post.publishedAt
    ? new Date(post.publishedAt)
    : post.createdAt
      ? new Date(post.createdAt)
      : new Date()

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const {
    year,
    month: monthnum,
    day,
    hour,
    minute,
    second,
  } = parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>
  const postId = post.id ?? ''
  const postname = post.slug || ''
  const category = post.categorySlug ? slugify(post.categorySlug) : 'uncategorized'
  const author = post.authorSlug ? slugify(post.authorSlug) : 'author'

  const result = template
    .replace(/%year%/g, year)
    .replace(/%monthnum%/g, monthnum)
    .replace(/%day%/g, day)
    .replace(/%hour%/g, hour)
    .replace(/%minute%/g, minute)
    .replace(/%second%/g, second)
    .replace(/%post_id%/g, postId)
    .replace(/%postname%/g, postname)
    .replace(/%category%/g, category)
    .replace(/%author%/g, author)

  return result.startsWith('/') ? result : `/${result}`
}

export const permalinkTokens = [
  'year',
  'monthnum',
  'day',
  'hour',
  'minute',
  'second',
  'post_id',
  'postname',
  'category',
  'author',
] as const
export const publicReservedSegments = new Set([
  ...RESERVED_SEGMENTS,
  'preview',
  'search',
  'bookmarks',
  'archive',
  'category',
  'tag',
  'author',
  'themes',
  'opengraph-image',
  'icon',
  'apple-icon',
])
export function validatePermalinkStructure(structure: string) {
  if (structure === '/?p=%post_id%') return
  if (
    !structure.startsWith('/') ||
    structure.startsWith('//') ||
    structure.length > 300 ||
    /[?#\\\s.]/.test(structure) ||
    structure.includes('//')
  )
    throw new Error('Struktur permalink harus berupa path situs yang valid.')
  const tokens = [...structure.matchAll(/%([a-z_]+)%/g)].map((m) => m[1]!)
  if (
    !tokens.some((token) => token === 'postname' || token === 'post_id') ||
    tokens.some((token) => !(permalinkTokens as readonly string[]).includes(token)) ||
    new Set(tokens).size !== tokens.length ||
    /%/.test(structure.replace(/%[a-z_]+%/g, '')) ||
    !/^\/(?:[a-zA-Z0-9_-]+|%[a-z_]+%)(?:\/(?:[a-zA-Z0-9_-]+|%[a-z_]+%))*\/?$/.test(structure)
  )
    throw new Error(
      'Gunakan token yang didukung, satu per segmen, serta %postname% atau %post_id%.',
    )
  if (publicReservedSegments.has(structure.split('/')[1]!.toLowerCase()))
    throw new Error('Awalan permalink digunakan oleh halaman sistem.')
}
export function matchPostPermalink(path: string, structure: string): Record<string, string> | null {
  if (structure === '/?p=%post_id%') {
    const url = new URL(path, 'http://cms.local')
    return url.pathname === '/' && url.searchParams.get('p')
      ? { post_id: url.searchParams.get('p')! }
      : null
  }
  const tokens: string[] = []
  const regex = structure
    .replace(/\/$/, '')
    .split('/')
    .map((segment) => {
      const token = /^%([a-z_]+)%$/.exec(segment)?.[1]
      if (token) {
        tokens.push(token)
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  const match = new RegExp(`^${regex}/?$`).exec(path)
  if (!match) return null
  try {
    return Object.fromEntries(tokens.map((token, i) => [token, decodeURIComponent(match[i + 1]!)]))
  } catch {
    return null
  }
}
