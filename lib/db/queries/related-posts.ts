import { postPaths } from '@/lib/content/permalink-server'
import 'server-only'
import { and, asc, desc, eq, inArray, lt, lte, ne, or, gt } from 'drizzle-orm'
import { getDb, hasDatabase } from '@/lib/db'
import { postCategories, posts } from '@/lib/db/schema'
import type { Post } from '@/types'

export type ArticleLink = {
  id: string
  title: string
  permalink?: string
  slug: string
  excerpt: string
  featuredImage: string | null
  featuredImageAlt: string | null
}
const selection = {
  id: posts.id,
  title: posts.title,
  slug: posts.slug,
  excerpt: posts.excerpt,
  featuredImage: posts.featuredImage,
  featuredImageAlt: posts.featuredImageAlt,
}

export async function getArticleNeighbors(
  post: Post,
): Promise<{ related: ArticleLink[]; previous: ArticleLink | null; next: ArticleLink | null }> {
  if (!hasDatabase()) return { related: [], previous: null, next: null }
  const db = getDb()
  const visible = and(eq(posts.status, 'published'), lte(posts.publishedAt, new Date()))
  const publishedAt = new Date(post.publishedAt)
  const categoryIds = post.categories.map((category) => category.id)
  const [related, previous, next] = await Promise.all([
    categoryIds.length
      ? db
          .select(selection)
          .from(posts)
          .where(
            and(
              visible,
              ne(posts.id, post.id),
              inArray(
                posts.id,
                db
                  .select({ id: postCategories.postId })
                  .from(postCategories)
                  .where(inArray(postCategories.categoryId, categoryIds)),
              ),
            ),
          )
          .orderBy(desc(posts.publishedAt), desc(posts.id))
          .limit(4)
      : Promise.resolve([]),
    db
      .select(selection)
      .from(posts)
      .where(
        and(
          visible,
          or(
            lt(posts.publishedAt, publishedAt),
            and(eq(posts.publishedAt, publishedAt), lt(posts.id, post.id)),
          ),
        ),
      )
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(1),
    db
      .select(selection)
      .from(posts)
      .where(
        and(
          visible,
          or(
            gt(posts.publishedAt, publishedAt),
            and(eq(posts.publishedAt, publishedAt), gt(posts.id, post.id)),
          ),
        ),
      )
      .orderBy(asc(posts.publishedAt), asc(posts.id))
      .limit(1),
  ])
  const paths = await postPaths([...related, ...previous, ...next].map((row) => row.id))
  const link = (row: ArticleLink) => ({ ...row, permalink: paths.get(row.id) })
  return {
    related: related.map(link),
    previous: previous[0] ? link(previous[0]) : null,
    next: next[0] ? link(next[0]) : null,
  }
}
