import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { posts, viewBatches, viewDaily } from '@/lib/db/schema'
import { viewDaySchema, viewDelta, viewMetricSchema, viewCountSchema } from '@/lib/views'

export async function persistViewSnapshot(
  day: string,
  batchId: string,
  metrics: { metric: string; count: number }[],
) {
  viewDaySchema.parse(day)
  if (!/^b[a-f0-9]{30}$/.test(batchId)) throw new Error('Invalid counter generation')
  if (metrics.length > 500 || new Set(metrics.map((entry) => entry.metric)).size !== metrics.length)
    throw new Error('Counter batch is too large or contains duplicate metrics')
  for (const entry of metrics) {
    viewMetricSchema.parse(entry.metric)
    viewCountSchema.parse(entry.count)
  }
  if (!metrics.length) return 0
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-views-flush'))`)
    const [batchDay] = await tx
      .select({ day: viewBatches.day })
      .from(viewBatches)
      .where(eq(viewBatches.batchId, batchId))
      .limit(1)
    if (batchDay && batchDay.day !== day)
      throw new Error('Counter generation belongs to another day')
    const existing = await tx
      .select()
      .from(viewBatches)
      .where(
        and(
          eq(viewBatches.batchId, batchId),
          inArray(
            viewBatches.metric,
            metrics.map((entry) => entry.metric),
          ),
        ),
      )
      .for('update')
    const changes = metrics.flatMap((entry) => {
      const old = existing.find((item) => item.metric === entry.metric)
      const delta = viewDelta(old?.count ?? 0, entry.count)
      return delta ? [{ ...entry, delta }] : []
    })
    if (!changes.length) return 0
    await tx
      .insert(viewBatches)
      .values(changes.map((entry) => ({ batchId, day, metric: entry.metric, count: entry.count })))
      .onConflictDoUpdate({
        target: [viewBatches.batchId, viewBatches.metric],
        set: { count: sql`excluded.count`, updatedAt: new Date() },
      })
    await tx
      .insert(viewDaily)
      .values(changes.map((entry) => ({ day, metric: entry.metric, count: entry.delta })))
      .onConflictDoUpdate({
        target: [viewDaily.day, viewDaily.metric],
        set: { count: sql`${viewDaily.count} + excluded.count`, updatedAt: new Date() },
      })
    const articleChanges = changes.filter((entry) => entry.metric !== 'site')
    if (articleChanges.length) {
      const values = sql.join(
        articleChanges.map(
          (entry) => sql`(${entry.metric.slice(5)}::text, ${entry.delta}::bigint)`,
        ),
        sql`, `,
      )
      await tx.execute(
        sql`update ${posts} set view_count = least(2147483647::bigint, ${posts.viewCount}::bigint + changed.delta)::int from (values ${values}) as changed(id, delta) where ${posts.id} = changed.id`,
      )
    }
    return changes.reduce((total, entry) => total + entry.delta, 0)
  })
}
