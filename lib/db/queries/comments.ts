import 'server-only'
import { createHmac } from 'node:crypto'
import { and, count, eq, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { headers } from 'next/headers'
import { getSettings } from './settings'
import { requireCapability } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { posts, comments, commentLimits } from '@/lib/db/schema'
import { newId } from './admin-content'
import { clientIp } from '@/lib/client-ip'
const input = z.object({
  postId: z.string().regex(/^[a-f0-9]{32}$/),
  authorName: z.string().trim().min(1).max(120),
  authorEmail: z.email().max(200),
  content: z.string().trim().min(3).max(5000),
  website: z.string().max(1000),
})
export async function approvedComments(postId: string) {
  return getDb()
    .select({
      id: comments.id,
      authorName: comments.authorName,
      content: comments.content,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(and(eq(comments.postId, postId), eq(comments.status, 'approved')))
    .orderBy(comments.createdAt)
}
export async function submitCommentData(data: FormData) {
  const value = input.parse(Object.fromEntries(data))
  if (!(await getSettings()).commentsEnabled)
    throw new Error('Komentar baru ditutup untuk situs ini.')
  if (value.website) return
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('Komentar belum tersedia')
  const requestHeaders = await headers()
  const ip = clientIp(requestHeaders)
  const hash = createHmac('sha256', secret).update(ip).digest('hex')
  const result = await getDb().transaction(async (tx) => {
    const [post] = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.id, value.postId),
          eq(posts.status, 'published'),
          lte(posts.publishedAt, new Date()),
          eq(posts.allowComments, true),
        ),
      )
    if (!post) return 'Artikel tidak menerima komentar'
    const key = `comment:${hash}`
    const [limit] = await tx
      .insert(commentLimits)
      .values({ key, count: 1, resetAt: new Date(Date.now() + 60000) })
      .onConflictDoUpdate({
        target: commentLimits.key,
        set: {
          count: sql`case when ${commentLimits.resetAt} < now() then 1 else ${commentLimits.count} + 1 end`,
          resetAt: sql`case when ${commentLimits.resetAt} < now() then now() + interval '1 minute' else ${commentLimits.resetAt} end`,
        },
      })
      .returning()
    if (limit!.count > 3) return 'Terlalu banyak komentar. Coba lagi satu menit lagi.'
    await tx.insert(comments).values({
      id: newId(),
      postId: value.postId,
      authorName: value.authorName,
      authorEmail: value.authorEmail,
      content: value.content,
      status: 'pending',
      ipHash: hash,
    })
    return null
  })
  if (result) throw new Error(result)
}
export async function moderateCommentData(id: string, status: 'approved' | 'pending' | 'spam') {
  await requireCapability('moderate_comments')
  return getDb().transaction(async (tx) => {
    const [comment] = await tx
      .update(comments)
      .set({ status })
      .where(eq(comments.id, id))
      .returning({ postId: comments.postId })
    if (!comment) return null
    // Serialize moderation for the same post before updating its count.
    await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, comment.postId)).for('update')
    const [total] = await tx
      .select({ value: count() })
      .from(comments)
      .where(and(eq(comments.postId, comment.postId), eq(comments.status, 'approved')))
    await tx.update(posts).set({ commentCount: total!.value }).where(eq(posts.id, comment.postId))
    // Dikembalikan agar pemanggil dapat memicu action ekstensi `comment_approved`
    // dengan id artikelnya; transaksi ini satu-satunya tempat id itu dibaca.
    return { postId: comment.postId }
  })
}
