import { formatSiteDate } from '@/lib/content/site-date'
import { getSettings } from './settings'
import { formatPostPermalink } from '@/lib/core/permalinks'
import { permalinkConfig } from '@/lib/content/permalink-server'
import 'server-only'
import { and, count, desc, eq, getTableColumns, inArray, lte, sql } from 'drizzle-orm'
import { getDb, hasDatabase } from '@/lib/db'
import { authors, categories, pages, postCategories, posts, postTags } from '@/lib/db/schema'
import type { Post, PostSummary, Paginated } from '@/types'

type ReadContext = { db: Pick<ReturnType<typeof getDb>, 'select'>; now: Date }
const visible = (now = new Date()) =>
  and(eq(posts.status, 'published'), lte(posts.publishedAt, now))
// Summary queries never transfer the article body from PostgreSQL.
const summarySelection = { ...getTableColumns(posts), content: sql<string>`''` }
// Public category cards do not use hierarchy or administrative metadata. Keep
// these reads compatible while an additive category migration is being rolled out.
const publicCategorySelection = {
  id: categories.id,
  slug: categories.slug,
  name: categories.name,
  description: categories.description,
}
function summaries(rows: Post[]): PostSummary[] {
  return rows.map(({ content, contentHtml, ...summary }) => {
    void content
    void contentHtml
    return summary
  })
}
export function pageNumber(value: unknown) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100000) : 1
}
async function enrich(rows: (typeof posts.$inferSelect)[], context?: ReadContext): Promise<Post[]> {
  if (!rows.length) return []
  const db = context?.db ?? getDb(),
    ids = rows.map((p) => p.id)
  const writerQuery = db
    .select()
    .from(authors)
    .where(inArray(authors.id, [...new Set(rows.map((p) => p.authorId))]))
  const categoryQuery = db
    .select({ postId: postCategories.postId, category: publicCategorySelection })
    .from(postCategories)
    .innerJoin(categories, eq(categories.id, postCategories.categoryId))
    .where(inArray(postCategories.postId, ids))
    .orderBy(sql`lower(${categories.name})`, categories.name, categories.id)
  const tagQuery = db.select().from(postTags).where(inArray(postTags.postId, ids))
  // A transaction uses one PostgreSQL client; only pooled reads can run concurrently.
  const [writerRows, categoryRows, tagRows] = context
    ? ([await writerQuery, await categoryQuery, await tagQuery] as const)
    : await Promise.all([writerQuery, categoryQuery, tagQuery])
  const settings = await getSettings()
  const config = permalinkConfig(settings)
  return rows.map((p) => {
    const writer = writerRows.find((a) => a.id === p.authorId)!
    return {
      ...p,
      permalink: formatPostPermalink(
        {
          ...p,
          authorSlug: writer.slug,
          categorySlug: categoryRows.find((c) => c.postId === p.id)?.category.slug,
        },
        config,
      ),
      featuredImage: p.featuredImage ?? undefined,
      featuredImageAlt: p.featuredImageAlt ?? undefined,
      status: p.status as Post['status'],
      layout: p.layout as Post['layout'],
      publishedAt: p.publishedAt.toISOString(),
      publishedLabel: formatSiteDate(p.publishedAt, settings),
      updatedLabel: p.updatedAt ? formatSiteDate(p.updatedAt, settings) : undefined,
      updatedAt: p.updatedAt?.toISOString(),
      legacyPath: p.legacyPath ?? undefined,
      author: {
        id: writer.id,
        slug: writer.slug,
        name: writer.name,
        avatar: writer.avatar ?? undefined,
        bio: writer.bio ?? undefined,
        role: writer.role ?? undefined,
        verified: writer.verified,
        social: writer.social ?? undefined,
      },
      categories: categoryRows
        .filter((c) => c.postId === p.id)
        .map((c) => ({
          id: c.category.id,
          slug: c.category.slug,
          permalink: `/${config.categoryBase || 'category'}/${c.category.slug}`,
          name: c.category.name,
          description: c.category.description ?? undefined,
        })),
      tags: tagRows.filter((t) => t.postId === p.id).map((t) => t.tag),
    }
  })
}
export async function getPosts(
  {
    page = 1,
    perPage,
    categorySlug,
    authorSlug,
    query,
    tag,
    year,
  }: {
    page?: number
    perPage?: number
    categorySlug?: string
    authorSlug?: string
    tag?: string
    query?: string
    year?: number
  } = {},
  context?: ReadContext,
): Promise<Paginated<PostSummary>> {
  page = pageNumber(page)
  const settings = await getSettings()
  perPage = Math.min(100, Math.max(1, perPage ?? settings.postsPerPage))
  if (!hasDatabase()) return { items: [], page, perPage, total: 0, totalPages: 0 }
  const db = context?.db ?? getDb()
  const conditions = [visible(context?.now)]
  if (categorySlug)
    conditions.push(
      inArray(
        posts.id,
        db
          .select({ id: postCategories.postId })
          .from(postCategories)
          .innerJoin(categories, eq(categories.id, postCategories.categoryId))
          .where(eq(categories.slug, categorySlug)),
      ),
    )
  if (authorSlug)
    conditions.push(
      inArray(
        posts.authorId,
        db.select({ id: authors.id }).from(authors).where(eq(authors.slug, authorSlug)),
      ),
    )
  if (tag)
    conditions.push(
      inArray(
        posts.id,
        db.select({ id: postTags.postId }).from(postTags).where(eq(postTags.tag, tag)),
      ),
    )
  if (query?.trim())
    conditions.push(
      sql`${posts.searchVector} @@ websearch_to_tsquery('simple', ${query.trim().slice(0, 200)})`,
    )
  if (year)
    conditions.push(
      sql`extract(year from ${posts.publishedAt} at time zone ${settings.timezone}) = ${year}`,
    )
  const where = and(...conditions)
  const totalsQuery = db.select({ value: count() }).from(posts).where(where)
  const rowsQuery = db
    .select(summarySelection)
    .from(posts)
    .where(where)
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(perPage)
    .offset((page - 1) * perPage)
  const [totals, rows] = context
    ? ([await totalsQuery, await rowsQuery] as const)
    : await Promise.all([totalsQuery, rowsQuery])
  const total = totals[0]!.value
  const enriched = await enrich(rows, context)
  const items = summaries(enriched)
  return { items, page, perPage, total, totalPages: Math.ceil(total / perPage) }
}
export async function getPublicPostSummariesByIds(
  ids: string[],
  context?: ReadContext,
): Promise<PostSummary[]> {
  const validIds = [...new Set(ids)].filter((id) => /^[a-f0-9]{32}$/.test(id)).slice(0, 200)
  if (!validIds.length || !hasDatabase()) return []
  const rows = await (context?.db ?? getDb())
    .select(summarySelection)
    .from(posts)
    .where(and(visible(context?.now), inArray(posts.id, validIds)))
  const items = summaries(await enrich(rows, context))
  return validIds.flatMap((id) => {
    const item = items.find((post) => post.id === id)
    return item ? [item] : []
  })
}
export async function getPostBySlug(slug: string) {
  if (!hasDatabase()) return null
  return (
    (
      await enrich(
        await getDb()
          .select()
          .from(posts)
          .where(and(visible(), eq(posts.slug, slug)))
          .limit(1),
      )
    )[0] ?? null
  )
}
export async function getCategory(slug: string) {
  if (!hasDatabase()) return null
  return (
    (
      await getDb()
        .select(publicCategorySelection)
        .from(categories)
        .where(eq(categories.slug, slug))
    )[0] ?? null
  )
}
export async function getAuthor(slug: string) {
  if (!hasDatabase()) return null
  return (await getDb().select().from(authors).where(eq(authors.slug, slug)))[0] ?? null
}
export async function getPage(slug: string) {
  if (!hasDatabase()) return null
  return (await getDb().select().from(pages).where(eq(pages.slug, slug)))[0] ?? null
}
export async function getArchiveYears() {
  if (!hasDatabase()) return []
  const settings = await getSettings()
  return getDb()
    .select({
      year: sql<number>`extract(year from ${posts.publishedAt} at time zone ${settings.timezone})::int`,
      count: count(),
    })
    .from(posts)
    .where(visible())
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`)
}
