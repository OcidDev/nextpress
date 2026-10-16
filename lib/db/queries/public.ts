import { getSettings } from './settings'
import 'server-only'
import { and, count, desc, eq, lte, sql } from 'drizzle-orm'
import { getDb, hasDatabase } from '@/lib/db'
import { authors, categories, pages, postCategories, posts } from '@/lib/db/schema'

/** Reads that only the public site needs. */
export async function getPublicPageById(id: string) {
  if (!hasDatabase() || !id) return null
  return (await getDb().select().from(pages).where(eq(pages.id, id)).limit(1))[0] ?? null
}

export async function getPublicAuthorById(id: string) {
  if (!hasDatabase() || !id) return null
  return (await getDb().select().from(authors).where(eq(authors.id, id)).limit(1))[0] ?? null
}

export async function getPublicCategories(
  limit = 200,
  sort: 'alphabetical' | 'count' = 'alphabetical',
) {
  if (!hasDatabase()) return []
  const base = (await getSettings()).categoryBase || 'category'
  return getDb()
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      total: count(posts.id),
    })
    .from(categories)
    .innerJoin(postCategories, eq(postCategories.categoryId, categories.id))
    .innerJoin(
      posts,
      and(
        eq(posts.id, postCategories.postId),
        eq(posts.status, 'published'),
        lte(posts.publishedAt, new Date()),
      ),
    )
    .groupBy(categories.id)
    .orderBy(
      ...(sort === 'count'
        ? [desc(count(posts.id)), sql`lower(${categories.name})`, categories.name]
        : [sql`lower(${categories.name})`, categories.name]),
    )
    .limit(Math.max(1, Math.min(limit, 200)))
    .then((rows) => rows.map((row) => ({ ...row, permalink: `/${base}/${row.slug}` })))
}

export async function getPublicSitemapEntries() {
  if (!hasDatabase()) return { posts: [], pages: [], authors: [], categories: [] }
  const db = getDb()
  const [published, staticPages, writers, labels] = await Promise.all([
    db
      .select({
        id: posts.id,
        slug: posts.slug,
        updatedAt: posts.updatedAt,
        publishedAt: posts.publishedAt,
      })
      .from(posts)
      .where(and(eq(posts.status, 'published'), lte(posts.publishedAt, new Date()))),
    db.select({ id: pages.id, slug: pages.slug, updatedAt: pages.updatedAt }).from(pages),
    db
      .select({ slug: authors.slug })
      .from(authors)
      .where(
        sql`exists(select 1 from posts where posts.author_id=${authors.id} and posts.status='published' and posts.published_at <= now())`,
      ),
    db
      .select({ slug: categories.slug })
      .from(categories)
      .where(
        sql`exists(select 1 from post_categories join posts on posts.id=post_categories.post_id where post_categories.category_id=${categories.id} and posts.status='published' and posts.published_at <= now())`,
      ),
  ])
  return { posts: published, pages: staticPages, authors: writers, categories: labels }
}
