import { and, eq, lte, sql } from 'drizzle-orm'
import { newId } from '@/lib/db/ids'
import type { CoreTransaction } from '@/lib/db/meta-store'
import { options } from '@/lib/db/core-schema'
import type { JsonValue } from './options'
import { content } from '@/lib/db/core-schema'
import { contentMeta } from '@/lib/db/data-schema'
import { assertUnmappedCoreWrite, lockContentStructure } from './content-mapping'

export interface CronEvent {
  id: string
  hook: string
  args: unknown[]
  dueAt: number // timestamp in ms
  schedule?: 'hourly' | 'twicedaily' | 'daily' | number
}

export interface CronDispatchReport {
  dispatched: number
  publishedPosts: number
  cleanedTrash: number
  cleanedLocks: number
  errors: string[]
}

const CRON_OPTION_NAME = 'cron'

function scheduleIntervalMs(schedule?: 'hourly' | 'twicedaily' | 'daily' | number): number {
  if (typeof schedule === 'number') return schedule * 1000
  if (schedule === 'hourly') return 60 * 60 * 1000
  if (schedule === 'twicedaily') return 12 * 60 * 60 * 1000
  if (schedule === 'daily') return 24 * 60 * 60 * 1000
  return 0
}

export function createCronService(tx: CoreTransaction) {
  const hookHandlers = new Map<string, (args: unknown[]) => Promise<void> | void>()

  async function getEvents(): Promise<CronEvent[]> {
    const [row] = await tx
      .select({ value: options.value })
      .from(options)
      .where(eq(options.name, CRON_OPTION_NAME))

    if (!row || !Array.isArray(row.value)) return []
    return row.value as unknown as CronEvent[]
  }

  async function saveEvents(events: CronEvent[]): Promise<void> {
    await tx
      .insert(options)
      .values({
        name: CRON_OPTION_NAME,
        value: events as unknown as JsonValue,
        autoload: true,
      })
      .onConflictDoUpdate({
        target: options.name,
        set: { value: events as unknown as JsonValue, updatedAt: new Date() },
      })
  }

  return {
    /**
     * Registers a custom action hook handler.
     */
    registerHook(hook: string, handler: (args: unknown[]) => Promise<void> | void) {
      hookHandlers.set(hook, handler)
    },
    /**
     * Schedules a one-off or recurring cron event.
     * Deduplicates by hook and serialized args.
     */
    async scheduleEvent(params: {
      hook: string
      dueAt: Date | number
      args?: unknown[]
      schedule?: 'hourly' | 'twicedaily' | 'daily' | number
    }): Promise<CronEvent> {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-cron-schedule'))`)

      const events = await getEvents()
      const dueMs = typeof params.dueAt === 'number' ? params.dueAt : params.dueAt.getTime()
      const args = params.args ?? []

      // Deduplicate: find if same hook and args exist
      const existingIdx = events.findIndex(
        (e) => e.hook === params.hook && JSON.stringify(e.args) === JSON.stringify(args),
      )

      let event: CronEvent
      if (existingIdx >= 0) {
        event = {
          ...events[existingIdx]!,
          dueAt: dueMs,
          schedule: params.schedule ?? events[existingIdx]!.schedule,
        }
        events[existingIdx] = event
      } else {
        event = {
          id: newId(),
          hook: params.hook,
          args,
          dueAt: dueMs,
          schedule: params.schedule,
        }
        events.push(event)
      }

      await saveEvents(events)
      return event
    },

    /**
     * Unschedules an event matching hook and args.
     */
    async unscheduleEvent(hook: string, args: unknown[] = []): Promise<boolean> {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-cron-schedule'))`)

      const events = await getEvents()
      const before = events.length
      const filtered = events.filter(
        (e) => !(e.hook === hook && JSON.stringify(e.args) === JSON.stringify(args)),
      )

      if (filtered.length !== before) {
        await saveEvents(filtered)
        return true
      }
      return false
    },

    /**
     * Lists all scheduled cron events sorted by due date.
     */
    async listEvents(): Promise<CronEvent[]> {
      const events = await getEvents()
      return events.sort((a, b) => a.dueAt - b.dueAt)
    },

    /**
     * Alias for listEvents.
     */
    async getScheduledEvents(): Promise<CronEvent[]> {
      return this.listEvents()
    },

    /**
     * Dispatches all due cron events.
     * Protected by advisory lock so multiple concurrent workers will not execute twice.
     */
    async dispatchDueEvents(): Promise<CronDispatchReport> {
      await lockContentStructure(tx)
      // Transaction-scoped advisory lock prevents dual dispatching
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-cron-dispatcher'))`)

      const now = Date.now()
      const events = await getEvents()
      const dueEvents = events.filter((e) => e.dueAt <= now)

      const report: CronDispatchReport = {
        dispatched: 0,
        publishedPosts: 0,
        cleanedTrash: 0,
        cleanedLocks: 0,
        errors: [],
      }

      if (!dueEvents.length) {
        // Also run direct scheduled checks for any due future posts regardless of event queue
        const directDue = await tx
          .select({ id: content.id })
          .from(content)
          .where(and(eq(content.status, 'future'), lte(content.publishedAt, new Date())))

        for (const post of directDue) {
          await assertUnmappedCoreWrite(tx, post.id)
          await tx.execute(sql`
            update cms_content
            set status = 'publish',
                modified_at = now()
            where id = ${post.id}
          `)
          report.publishedPosts++
        }

        return report
      }

      const remainingEvents: CronEvent[] = []

      for (const event of events) {
        if (event.dueAt > now) {
          remainingEvents.push(event)
          continue
        }

        report.dispatched++

        try {
          if (event.hook === 'publish_future_post' || event.hook === 'publish_future_posts') {
            // Find posts scheduled for future whose publication date has passed
            const targetId = event.args[0] as string | undefined
            const condition = targetId
              ? and(
                  eq(content.id, targetId),
                  eq(content.status, 'future'),
                  lte(content.publishedAt, new Date()),
                )
              : and(eq(content.status, 'future'), lte(content.publishedAt, new Date()))

            const duePosts = await tx.select({ id: content.id }).from(content).where(condition)

            for (const post of duePosts) {
              await assertUnmappedCoreWrite(tx, post.id)
              await tx.execute(sql`
                update cms_content
                set status = 'publish',
                    modified_at = now()
                where id = ${post.id}
              `)
              report.publishedPosts++
            }
          } else if (event.hook === 'empty_trash' || event.hook === 'delete_old_trash') {
            // Trash older than 30 days
            const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
            const trashedPosts = await tx
              .select({ id: content.id, type: content.type })
              .from(content)
              .where(eq(content.status, 'trash'))

            for (const post of trashedPosts) {
              const [metaRow] = await tx
                .select({ value: contentMeta.value })
                .from(contentMeta)
                .where(
                  and(
                    eq(contentMeta.objectId, post.id),
                    eq(contentMeta.key, '_wp_trash_meta_time'),
                  ),
                )

              const trashTime = Number(metaRow?.value ?? 0)
              if (trashTime > 0 && trashTime < thirtyDaysAgo) {
                await assertUnmappedCoreWrite(tx, post.id)
                await tx.execute(sql`delete from cms_content where id = ${post.id}`)
                report.cleanedTrash++
              }
            }
          } else if (event.hook === 'clean_expired_locks') {
            // Clean locks older than 2 minutes
            const twoMinutesAgo = now - 120 * 1000
            const locks = await tx
              .select({ id: contentMeta.id, value: contentMeta.value })
              .from(contentMeta)
              .where(
                and(
                  eq(contentMeta.key, '_edit_lock'),
                  sql`not exists (
                select 1 from cms_legacy_content_map m where m.content_id=${contentMeta.objectId}
              )`,
                ),
              )

            for (const lock of locks) {
              const data = (lock.value as { lockedAt?: number }) ?? {}
              if (!data.lockedAt || data.lockedAt < twoMinutesAgo) {
                await tx.delete(contentMeta).where(eq(contentMeta.id, lock.id))
                report.cleanedLocks++
              }
            }
          } else if (hookHandlers.has(event.hook)) {
            await hookHandlers.get(event.hook)!(event.args)
          }

          // Reschedule if recurring
          const interval = scheduleIntervalMs(event.schedule)
          if (interval > 0) {
            remainingEvents.push({
              ...event,
              dueAt: now + interval,
            })
          }
        } catch (err) {
          report.errors.push(
            `Error executing hook ${event.hook}: ${err instanceof Error ? err.message : String(err)}`,
          )
          // Keep event for retry
          remainingEvents.push(event)
        }
      }

      await saveEvents(remainingEvents)
      return report
    },
  }
}
