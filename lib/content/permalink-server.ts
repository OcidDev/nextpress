import { createHash } from 'node:crypto'
import 'server-only'
import { cache } from 'react'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { getDb, hasDatabase } from '@/lib/db'
import { authors, categories, pages, postCategories, posts } from '@/lib/db/schema'
import { getSettings } from '@/lib/db/queries/settings'
import {
  formatPostPermalink,
  matchPostPermalink,
  normalizePath,
  publicReservedSegments,
  validatePermalinkStructure,
} from '@/lib/core/permalinks'
import { SettingsValidationError, type SiteSettings } from './settings'

const aliasKey = (path: string) =>
  `permalink:alias:${createHash('sha256').update(normalizePath(path)).digest('hex')}`
type Reader = Pick<ReturnType<typeof getDb>, 'select'>
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
export const permalinkConfig = (settings: SiteSettings) => ({
  structure: settings.permalinkStructure,
  timezone: settings.timezone,
  categoryBase: settings.categoryBase,
  tagBase: settings.tagBase,
})
export async function postRouteRows(db: Reader = getDb(), ids?: string[]) {
  if (ids && !ids.length) return []
  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      publishedAt: posts.publishedAt,
      authorSlug: authors.slug,
      categorySlug: sql<string>`coalesce((select c.slug from ${postCategories} pc
      join ${categories} c on c.id=pc.category_id where pc.post_id=${posts.id}
      order by lower(c.name), c.name, c.id limit 1), 'uncategorized')`,
    })
    .from(posts)
    .innerJoin(authors, eq(authors.id, posts.authorId))
    .where(ids ? inArray(posts.id, ids) : undefined)
}
export async function postPaths(ids: string[]) {
  if (!hasDatabase() || !ids.length) return new Map<string, string>()
  const config = permalinkConfig(await getSettings())
  return new Map(
    (await postRouteRows(getDb(), ids)).map((row) => [row.id, formatPostPermalink(row, config)]),
  )
}
export async function rememberPostRoutes(tx: Transaction, settings: SiteSettings, ids?: string[]) {
  const rows = await postRouteRows(tx, ids)
  if (!ids)
    for (const [base, kind] of [
      [settings.categoryBase || 'category', 'category'],
      [settings.tagBase || 'tag', 'tag'],
    ]) {
      await tx.execute(sql`insert into cms_options(name,value,autoload,legacy)
      values(${`permalink:base:${base}`}, ${JSON.stringify(kind)}::jsonb, false, false) on conflict(name) do nothing`)
    }
  for (const row of rows) {
    await tx.execute(sql`insert into cms_options(name,value,autoload,legacy)
      values(${`permalink:guid:${row.id}`}, ${JSON.stringify(`/blog/${row.slug}`)}::jsonb, false, false) on conflict(name) do nothing`)
    const paths = [formatPostPermalink(row, permalinkConfig(settings)), `/blog/${row.slug}`]
    for (const path of paths) {
      // Individual keys avoid unbounded read/modify/write of a global redirect document.
      await tx.execute(sql`insert into cms_options(name,value,autoload,legacy)
        values(${aliasKey(path)}, ${JSON.stringify({ id: row.id, path: normalizePath(path) })}::jsonb, false, false)
        on conflict(name) do update set value=excluded.value, updated_at=now()
        where not exists(select 1 from posts where posts.id=cms_options.value->>'id')`)
    }
  }
}
export async function validatePublicPermalinks(tx: Transaction, settings: SiteSettings) {
  try {
    validatePermalinkStructure(settings.permalinkStructure)
  } catch (error) {
    throw new SettingsValidationError(
      error instanceof Error ? error.message : 'Struktur permalink tidak valid.',
    )
  }
  for (const [base, own] of [
    [settings.categoryBase || 'category', 'category'],
    [settings.tagBase || 'tag', 'tag'],
  ]) {
    if (
      !/^[a-z0-9-]+$/.test(base!) ||
      (base !== own && publicReservedSegments.has(base!)) ||
      base === 'blog' ||
      base === 'archives'
    )
      throw new SettingsValidationError(
        'Basis kategori/tag harus satu slug dan tidak boleh memakai halaman sistem.',
      )
  }
  if ((settings.categoryBase || 'category') === (settings.tagBase || 'tag'))
    throw new SettingsValidationError('Basis kategori dan tag harus berbeda.')
  const oldBases = await tx.execute(
    sql`select name, value from cms_options where name like 'permalink:base:%'`,
  )
  const bases = new Map(
    oldBases.rows.map((row) => [String(row.name).slice('permalink:base:'.length), row.value]),
  )
  for (const [base, kind] of [
    [settings.categoryBase || 'category', 'category'],
    [settings.tagBase || 'tag', 'tag'],
  ]) {
    if (bases.has(base!) && bases.get(base!) !== kind)
      throw new SettingsValidationError(
        'Basis ini masih dipakai oleh URL taksonomi lama. Pilih basis lain.',
      )
  }
  const occupied = new Map(
    (await tx.select({ id: pages.id, slug: pages.slug }).from(pages)).map((page) => [
      `/${page.slug}`,
      page.id,
    ]),
  )
  const aliases = await tx.execute(
    sql`select name, value from cms_options where name like 'permalink:alias:%' and exists(select 1 from posts where posts.id=cms_options.value->>'id')`,
  )
  const historical = new Map(
    aliases.rows.map((row) => {
      const value = row.value as { path: string; id: string }
      return [value.path, value.id]
    }),
  )
  for (const path of occupied.keys()) {
    if (historical.has(path))
      throw new SettingsValidationError(
        `URL laman ${path} masih dipakai oleh artikel lama. Pilih slug lain.`,
      )
  }
  const prefix = settings.permalinkStructure.split('/')[1]!
  if (bases.has(prefix) || prefix === settings.categoryBase || prefix === settings.tagBase)
    throw new SettingsValidationError('Awalan permalink masih digunakan oleh arsip kategori/tag.')
  for (const post of await postRouteRows(tx)) {
    const path = normalizePath(formatPostPermalink(post, permalinkConfig(settings)))
    const first = path.split('/')[1]!
    if (
      occupied.has(path) ||
      (historical.has(path) && historical.get(path) !== post.id) ||
      publicReservedSegments.has(first) ||
      bases.has(first) ||
      first === settings.categoryBase ||
      first === settings.tagBase
    )
      throw new SettingsValidationError(
        `Permalink ${path} bertabrakan dengan halaman atau URL lain. Ubah struktur atau slug.`,
      )
    occupied.set(path, post.id)
  }
}
export const findPublicPostRoute = cache(async (path: string) => {
  if (!hasDatabase()) return null
  const settings = await getSettings()
  const tokens = matchPostPermalink(path, settings.permalinkStructure)
  const id = tokens?.post_id
  const slug = tokens?.postname
  const lookup = async (condition: ReturnType<typeof eq>) => {
    const [row] = await getDb()
      .select({ id: posts.id, slug: posts.slug })
      .from(posts)
      .where(and(eq(posts.status, 'published'), lte(posts.publishedAt, new Date()), condition))
      .limit(1)
    if (!row) return null
    const canonical = (await postPaths([row.id])).get(row.id)!
    return { ...row, canonical }
  }
  if (!id && !slug) return null
  const current = await lookup(id ? eq(posts.id, id) : eq(posts.slug, slug!))
  // Only the configured URL is public. Historical aliases remain stored for
  // provenance/collision protection, but never resolve or redirect requests.
  return current && path === current.canonical ? current : null
})

export async function findPublicTaxonomyRoute(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length !== 2) return null
  const settings = await getSettings()
  const base = parts[0]!
  let kind: 'category' | 'tag' | null = null
  if (base === (settings.categoryBase || 'category')) kind = 'category'
  else if (base === (settings.tagBase || 'tag')) kind = 'tag'
  if (!kind) return null
  const canonicalBase =
    kind === 'category' ? settings.categoryBase || 'category' : settings.tagBase || 'tag'
  return { kind, slug: parts[1]!, canonical: `/${canonicalBase}/${parts[1]}` }
}
