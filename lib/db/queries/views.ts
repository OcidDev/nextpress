import { postPaths, findPublicPostRoute } from '@/lib/content/permalink-server'
import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm'
import { cache } from 'react'
import { getDb, hasDatabase } from '@/lib/db'
import { authors, categories, pages, posts, viewBatches, viewDaily } from '@/lib/db/schema'
import { redis } from '@/lib/redis'
import {
  READ_VIEW_SCAN_SCRIPT,
  TRACK_VIEWS_SCRIPT,
  VIEW_DAYS_KEY,
  viewCountSchema,
  viewDayKey,
  viewDaySchema,
  viewDelta,
  viewMetricSchema,
} from '@/lib/views'
import { getSettings } from './settings'
import { persistViewSnapshot } from '@/lib/db/view-snapshots'
export { persistViewSnapshot } from '@/lib/db/view-snapshots'
import { getPublicPostSummariesByIds } from './posts'
import type { PostSummary } from '@/types'

const today = () => new Date().toISOString().slice(0, 10)
export type ViewStats = {
  available: boolean
  siteTotal: number | null
  articleTotal: number | null
}
function optionalRedis() {
  try {
    return redis()
  } catch {
    return null
  }
}
function metric(id?: string) {
  return id ? viewMetricSchema.parse(`post:${id}`) : 'site'
}

async function liveSnapshot(target: string) {
  const client = optionalRedis()
  if (!client) return null
  try {
    const values = await client.hmget<{ __batch: string | null; value?: unknown }>(
      viewDayKey(today()),
      '__batch',
      target,
    )
    const batchId = values?.__batch
    if (!batchId || !/^b[a-f0-9]{30}$/.test(batchId)) return null
    const value = values?.[target as keyof typeof values]
    if (value === null || value === undefined) return null
    const parsed = viewCountSchema.safeParse(value)
    return parsed.success ? { batchId, count: parsed.data } : null
  } catch {
    return null
  }
}

export const getViewStats = cache(async (postId?: string): Promise<ViewStats> => {
  const unavailable: ViewStats = { available: false, siteTotal: null, articleTotal: null }
  if (!hasDatabase() || !(await getSettings()).viewsEnabled) return unavailable
  const targets = ['site', ...(postId && /^[a-f0-9]{32}$/.test(postId) ? [metric(postId)] : [])]
  if (postId) {
    const [post] = await getDb()
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.status, 'published'),
          lte(posts.publishedAt, new Date()),
        ),
      )
      .limit(1)
    if (!post) return unavailable
  }
  const snapshots = await Promise.all(targets.map(liveSnapshot))
  const batches = snapshots.flatMap((item) => (item ? [item.batchId] : []))
  const { totals, watermarks } = await getDb().transaction(
    async (tx) => {
      const totals = await tx
        .select({
          metric: viewDaily.metric,
          count: sql<number>`coalesce(sum(${viewDaily.count}), 0)::float8`,
        })
        .from(viewDaily)
        .where(inArray(viewDaily.metric, targets))
        .groupBy(viewDaily.metric)
      const watermarks = batches.length
        ? await tx
            .select()
            .from(viewBatches)
            .where(and(inArray(viewBatches.batchId, batches), inArray(viewBatches.metric, targets)))
        : []
      return { totals, watermarks }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
  const values = targets.map((target, index) => {
    const saved = totals.find((item) => item.metric === target)
    const snapshot = snapshots[index]
    const watermark = watermarks.find(
      (item) => item.batchId === snapshot?.batchId && item.metric === target,
    )
    return saved || snapshot
      ? Math.max(0, Number(saved?.count ?? 0)) +
          (snapshot ? viewDelta(watermark?.count ?? 0, snapshot.count) : 0)
      : null
  })
  return {
    available: values.some((value) => value !== null),
    siteTotal: values[0] ?? null,
    articleTotal: postId ? (values[1] ?? null) : null,
  }
})

export async function getPopularPosts({
  limit = 5,
  range = '7days',
  excludeId,
}: { limit?: number; range?: '7days' | 'alltime'; excludeId?: string } = {}): Promise<
  PostSummary[]
> {
  if (!hasDatabase() || !(await getSettings()).viewsEnabled) return []
  limit = Math.min(20, Math.max(1, Math.floor(limit) || 5))
  const conditions = [eq(posts.status, 'published'), lte(posts.publishedAt, new Date())]
  if (excludeId) conditions.push(ne(posts.id, excludeId))
  let rows: { id: string; count: number }[]
  if (range === 'alltime') {
    rows = await getDb()
      .select({ id: posts.id, count: posts.viewCount })
      .from(posts)
      .where(and(...conditions, sql`${posts.viewCount} > 0`))
      .orderBy(desc(posts.viewCount), desc(posts.publishedAt), posts.id)
      .limit(limit)
  } else {
    const firstDay = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
    const count = sql<number>`sum(${viewDaily.count})::float8`
    rows = await getDb()
      .select({ id: posts.id, count })
      .from(posts)
      .innerJoin(viewDaily, eq(viewDaily.metric, sql`'post:' || ${posts.id}`))
      .where(and(...conditions, gte(viewDaily.day, firstDay), lte(viewDaily.day, today())))
      .groupBy(posts.id)
      .having(sql`sum(${viewDaily.count}) > 0`)
      .orderBy(desc(count), desc(posts.publishedAt), posts.id)
      .limit(limit)
  }
  const summaries = await getPublicPostSummariesByIds(rows.map((row) => row.id))
  return rows.flatMap((row) => {
    const post = summaries.find((item) => item.id === row.id)
    return post ? [{ ...post, viewCount: Number(row.count) }] : []
  })
}

export async function validPublicViewPath(path: string, postId?: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return false
  }
  if (postId) {
    const [post] = await getDb()
      .select({ slug: posts.slug })
      .from(posts)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.status, 'published'),
          lte(posts.publishedAt, new Date()),
        ),
      )
      .limit(1)
    return Boolean(
      post &&
      (decoded === (await postPaths([postId])).get(postId) || decoded === `/blog/${post.slug}`),
    )
  }
  if (await findPublicPostRoute(decoded)) return true
  if (['/', '/search', '/archive', '/bookmarks'].includes(decoded)) return true
  const pieces = decoded.slice(1).split('/')
  if (pieces[0] === 'archive' && pieces.length === 2) return /^(?:19|20|21)\d{2}$/.test(pieces[1]!)
  if (pieces[0] === 'blog' && pieces.length === 2) {
    const [post] = await getDb()
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.slug, pieces[1]!),
          eq(posts.status, 'published'),
          lte(posts.publishedAt, new Date()),
        ),
      )
      .limit(1)
    return Boolean(post)
  }
  if (pieces.length === 2 && ['category', 'author'].includes(pieces[0]!)) {
    const table = pieces[0] === 'category' ? categories : authors
    return Boolean(
      (
        await getDb()
          .select({ id: table.id })
          .from(table)
          .where(eq(table.slug, pieces[1]!))
          .limit(1)
      )[0],
    )
  }
  if (pieces.length === 1)
    return Boolean(
      (
        await getDb()
          .select({ id: pages.id })
          .from(pages)
          .where(and(eq(pages.slug, pieces[0]!), eq(pages.status, 'published')))
          .limit(1)
      )[0],
    )
  return false
}

export async function recordView({
  path,
  postId,
  site,
  ipHash,
  pathHash,
}: {
  path: string
  postId?: string
  site: boolean
  ipHash: string
  pathHash: string
}) {
  if (!(await validPublicViewPath(path, postId))) return 'missing' as const
  const client = optionalRedis()
  if (!client) return 'unavailable' as const
  const day = today(),
    targets = [...(site ? ['site'] : []), ...(postId ? [metric(postId)] : [])]
  const keys = [
    viewDayKey(day),
    `views:v1:rate:${ipHash}`,
    ...targets.map(
      (target) => `views:v1:dedupe:${ipHash}:${target === 'site' ? pathHash : target}`,
    ),
  ]
  const result = await client.eval<string[], number>(TRACK_VIEWS_SCRIPT, keys, [
    'b' + randomBytes(15).toString('hex'),
    ...targets,
    day,
  ])
  return result < 0
    ? ('limited' as const)
    : result === 0
      ? ('duplicate' as const)
      : ('recorded' as const)
}

export async function flushViews() {
  const client = optionalRedis()
  if (!client || !hasDatabase()) return { available: false, persisted: 0, pages: 0 }
  const dayCursorKey = 'views:v1:flush-day-cursor'
  const cursor = String((await client.get<string>(dayCursorKey)) ?? '0')
  const [nextDayCursor, candidates] = await client.sscan(VIEW_DAYS_KEY, cursor, { count: 3 })
  const days = candidates
    .filter((day): day is string => typeof day === 'string' && viewDaySchema.safeParse(day).success)
    .slice(0, 14)
  let persisted = 0,
    pages = 0
  const deadline = Date.now() + 25000
  daysLoop: for (const day of days) {
    const key = viewDayKey(day),
      scanKey = `views:v1:scan:${day}`
    let scanCursor = String((await client.get<string>(scanKey)) ?? '0')
    for (let page = 0; page < 10; page++) {
      if (pages >= 20 || Date.now() > deadline) break daysLoop
      const [generation, nextCursor, fields] = await client.eval<
        string[],
        [string, string, (string | number)[]]
      >(READ_VIEW_SCAN_SCRIPT, [key], [scanCursor])
      if (!generation) {
        await client.srem(VIEW_DAYS_KEY, day)
        break
      }
      const entries = []
      for (let index = 0; index < fields.length; index += 2) {
        const target = viewMetricSchema.safeParse(fields[index]),
          count = viewCountSchema.safeParse(fields[index + 1])
        if (target.success && count.success)
          entries.push({ metric: target.data, count: count.data })
      }
      if (entries.length > 2048) throw new Error('Counter scan exceeded its processing limit')
      // COUNT is a hint: Redis can return an entire compact hash in one scan page.
      for (let offset = 0; offset < entries.length; offset += 500)
        persisted += await persistViewSnapshot(day, generation, entries.slice(offset, offset + 500))
      pages++
      scanCursor = String(nextCursor)
      await client.set(scanKey, scanCursor)
      if (scanCursor === '0') {
        // Only retire closed days after a full extra day; requests cannot still write these buckets.
        if (day < new Date(Date.now() - 86400000).toISOString().slice(0, 10)) {
          await client.srem(VIEW_DAYS_KEY, day)
          await client.expire(key, 30 * 86400)
          await client.del(scanKey)
        }
        break
      }
    }
  }
  await client.set(dayCursorKey, String(nextDayCursor))
  return { available: true, persisted, pages }
}
