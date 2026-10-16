import { userHasCapability } from '@/lib/core/roles'
import 'server-only'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { requireCmsUser } from '@/lib/admin'
import { postScope, mediaScope } from './cms-scope'
import {
  adminPreferencesPatchSchema,
  adminPreferencesSchema,
  defaultAdminPreferences,
  type AdminPreferences,
} from '@/lib/content/admin-preferences'
import { settingsSchema } from '@/lib/content/settings'
import { getDb } from '@/lib/db'
import { getRequestOptions } from '@/lib/core/options-server'
import { adminPreferences, authors, comments, media, pages, posts } from '@/lib/db/schema'

export type DashboardData = {
  stats: {
    all: number
    published: number
    drafts: number
    pages: number
    media: number
    pending: number
    authors: number
  }
  drafts: { id: string; title: string; updatedAt: string }[]
  activity: {
    id: string
    title: string
    description: string
    href: string
    date: string
    kind: 'post' | 'comment'
  }[]
  pendingComments: {
    id: string
    authorName: string
    content: string
    title: string
    status: 'pending'
  }[]
  setup: {
    hasAuthor: boolean
    hasSiteIdentity: boolean
    hasPost: boolean
    hasNavigation: boolean
  }
}

function readPreferences(value: unknown): AdminPreferences {
  const result = adminPreferencesSchema.safeParse(value)
  return result.success ? result.data : defaultAdminPreferences()
}

export async function getAdminPreferences(): Promise<AdminPreferences> {
  const admin = await requireCmsUser()
  const [row] = await getDb()
    .select({ value: adminPreferences.value })
    .from(adminPreferences)
    .where(eq(adminPreferences.userId, admin.user.id))
  return readPreferences(row?.value)
}

export async function saveAdminPreferencesData(value: unknown): Promise<AdminPreferences> {
  const admin = await requireCmsUser()
  const patch = adminPreferencesPatchSchema.parse(value)
  return getDb().transaction(async (tx) => {
    // Also serializes the first save, where a row is not available to lock yet.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${'admin-preferences:' + admin.user.id}))`,
    )
    const [row] = await tx
      .select({ value: adminPreferences.value })
      .from(adminPreferences)
      .where(eq(adminPreferences.userId, admin.user.id))
      .for('update')
    const preferences = adminPreferencesSchema.parse({ ...readPreferences(row?.value), ...patch })
    await tx
      .insert(adminPreferences)
      .values({ userId: admin.user.id, value: preferences })
      .onConflictDoUpdate({
        target: adminPreferences.userId,
        set: { value: preferences, updatedAt: new Date() },
      })
    return preferences
  })
}

export async function getDashboardData(): Promise<DashboardData> {
  const session = await requireCmsUser()
  if (!userHasCapability(session.user, 'manage_options')) return getAuthorDashboard(session.user)
  const db = getDb()
  const postDate = sql<Date>`coalesce(${posts.updatedAt}, ${posts.publishedAt})`
  const [
    all,
    published,
    draftsCount,
    pageCount,
    mediaCount,
    pendingCount,
    authorCount,
    latestDrafts,
    latestPosts,
    latestComments,
    pendingComments,
    storedSettings,
  ] = await Promise.all([
    db.select({ value: count() }).from(posts),
    db.select({ value: count() }).from(posts).where(eq(posts.status, 'published')),
    db.select({ value: count() }).from(posts).where(eq(posts.status, 'draft')),
    db.select({ value: count() }).from(pages),
    db.select({ value: count() }).from(media),
    db.select({ value: count() }).from(comments).where(eq(comments.status, 'pending')),
    db.select({ value: count() }).from(authors),
    db
      .select({ id: posts.id, title: posts.title, updatedAt: postDate })
      .from(posts)
      .where(eq(posts.status, 'draft'))
      .orderBy(desc(postDate), posts.id)
      .limit(5),
    db
      .select({ id: posts.id, title: posts.title, status: posts.status, date: postDate })
      .from(posts)
      .orderBy(desc(postDate), posts.id)
      .limit(5),
    db
      .select({
        id: comments.id,
        authorName: comments.authorName,
        title: posts.title,
        status: comments.status,
        date: comments.createdAt,
      })
      .from(comments)
      .innerJoin(posts, eq(comments.postId, posts.id))
      .orderBy(desc(comments.createdAt), comments.id)
      .limit(5),
    db
      .select({
        id: comments.id,
        authorName: comments.authorName,
        content: comments.content,
        title: posts.title,
      })
      .from(comments)
      .innerJoin(posts, eq(comments.postId, posts.id))
      .where(eq(comments.status, 'pending'))
      .orderBy(desc(comments.createdAt), comments.id)
      .limit(5),
    getRequestOptions().getOption('site'),
  ])
  const stats = {
    all: all[0]?.value ?? 0,
    published: published[0]?.value ?? 0,
    drafts: draftsCount[0]?.value ?? 0,
    pages: pageCount[0]?.value ?? 0,
    media: mediaCount[0]?.value ?? 0,
    pending: pendingCount[0]?.value ?? 0,
    authors: authorCount[0]?.value ?? 0,
  }
  const site = settingsSchema.safeParse(storedSettings)
  const commentStatus: Record<string, string> = {
    pending: 'menunggu moderasi',
    approved: 'disetujui',
    spam: 'ditandai spam',
  }
  const activity: DashboardData['activity'] = [
    ...latestPosts.map((post) => ({
      id: `post-${post.id}`,
      title: post.title,
      description: post.status === 'published' ? 'Artikel terbit diperbarui' : 'Draft diperbarui',
      href: `/admin/posts/${post.id}`,
      date: new Date(post.date).toISOString(),
      kind: 'post' as const,
    })),
    ...latestComments.map((comment) => ({
      id: `comment-${comment.id}`,
      title: `Komentar pada ${comment.title}`,
      description: `${comment.authorName} · ${commentStatus[comment.status] ?? 'komentar'}`,
      href: '/admin/comments',
      date: comment.date.toISOString(),
      kind: 'comment' as const,
    })),
  ]
  activity.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  return {
    stats,
    drafts: latestDrafts.map((post) => ({
      id: post.id,
      title: post.title,
      updatedAt: new Date(post.updatedAt).toISOString(),
    })),
    activity: activity.slice(0, 8),
    pendingComments: pendingComments.map((comment) => ({
      ...comment,
      content: comment.content.slice(0, 240),
      status: 'pending',
    })),
    setup: {
      hasAuthor: stats.authors > 0,
      hasSiteIdentity: site.success,
      hasPost: stats.all > 0,
      hasNavigation: site.success && site.data.navigation.length > 0,
    },
  }
}

export async function getAdminPendingCount() {
  const session = await requireCmsUser()
  if (!userHasCapability(session.user, 'moderate_comments')) return 0
  const [result] = await getDb()
    .select({ value: count() })
    .from(comments)
    .where(eq(comments.status, 'pending'))
  return result?.value ?? 0
}

async function getAuthorDashboard(owner: { id: string; role: string }): Promise<DashboardData> {
  const db = getDb()
  const scope = postScope(owner)
  const date = sql<Date>`coalesce(${posts.updatedAt}, ${posts.publishedAt})`
  const [groups, images, profiles, drafts, latest] = await Promise.all([
    db
      .select({ status: posts.status, value: count() })
      .from(posts)
      .where(scope)
      .groupBy(posts.status),
    db.select({ value: count() }).from(media).where(mediaScope(owner)),
    db.select({ value: count() }).from(authors).where(eq(authors.userId, owner.id)),
    db
      .select({ id: posts.id, title: posts.title, updatedAt: date })
      .from(posts)
      .where(and(scope, eq(posts.status, 'draft')))
      .orderBy(desc(date), posts.id)
      .limit(5),
    db
      .select({ id: posts.id, title: posts.title, status: posts.status, date })
      .from(posts)
      .where(scope)
      .orderBy(desc(date), posts.id)
      .limit(5),
  ])
  const counts = Object.fromEntries(groups.map((row) => [row.status, row.value]))
  const all = groups.reduce((sum, row) => sum + row.value, 0)
  return {
    stats: {
      all,
      published: counts.published || 0,
      drafts: counts.draft || 0,
      media: images[0]?.value || 0,
      authors: profiles[0]?.value || 0,
      pages: 0,
      pending: 0,
    },
    drafts: drafts.map((post) => ({ ...post, updatedAt: new Date(post.updatedAt).toISOString() })),
    activity: latest.map((post) => ({
      id: `post-${post.id}`,
      title: post.title,
      description: post.status === 'published' ? 'Artikel terbit diperbarui' : 'Draft diperbarui',
      href: `/admin/posts/${post.id}`,
      date: new Date(post.date).toISOString(),
      kind: 'post',
    })),
    pendingComments: [],
    setup: {
      hasAuthor: !!profiles[0]?.value,
      hasPost: all > 0,
      hasSiteIdentity: false,
      hasNavigation: false,
    },
  }
}
