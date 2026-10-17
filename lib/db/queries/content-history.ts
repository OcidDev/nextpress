import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { contentRevisions, pages, posts, postCategories, postTags } from '@/lib/db/schema'
import { newId } from '@/lib/db/ids'

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
export type ContentKind = 'posts' | 'pages'

// Called inside the editor transaction, with the content row locked.
export async function recordContentRevision(
  tx: Transaction,
  kind: ContentKind,
  id: string,
  authorId: string,
) {
  let snapshot: Record<string, string | string[]>
  if (kind === 'posts') {
    const [post] = await tx.select().from(posts).where(eq(posts.id, id))
    if (!post) return
    const categories = await tx
      .select()
      .from(postCategories)
      .where(eq(postCategories.postId, id))
      .orderBy(postCategories.categoryId)
    const tags = await tx
      .select()
      .from(postTags)
      .where(eq(postTags.postId, id))
      .orderBy(postTags.tag)
    snapshot = {
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      featuredImage: post.featuredImage || '',
      featuredImageAlt: post.featuredImageAlt || '',
      categories: categories.map((item) => item.categoryId),
      tags: tags.map((item) => item.tag).join(', '),
    }
  } else {
    const [page] = await tx.select().from(pages).where(eq(pages.id, id))
    if (!page) return
    snapshot = {
      title: page.title,
      content: page.content,
      parentId: page.parentId || '',
      pageTemplate: page.pageTemplate,
      menuOrder: String(page.menuOrder),
    }
  }
  const [last] = await tx
    .select()
    .from(contentRevisions)
    .where(and(eq(contentRevisions.kind, kind), eq(contentRevisions.contentId, id)))
    .orderBy(desc(contentRevisions.createdAt), desc(contentRevisions.id))
    .limit(1)
  // JSONB may reorder keys; compare fields rather than serialization order.
  if (
    last &&
    Object.keys(snapshot).every(
      (key) => JSON.stringify(snapshot[key]) === JSON.stringify(last.snapshot[key]),
    )
  )
    return
  await tx.insert(contentRevisions).values({
    id: newId(),
    kind,
    contentId: id,
    authorId,
    snapshot,
    createdAt: new Date(Math.max(Date.now(), last ? last.createdAt.getTime() + 1 : 0)),
  })
}
