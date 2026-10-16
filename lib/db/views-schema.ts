import { bigint, date, index, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core'

// A site page view is separate from an article read. No visitor identifiers are persisted.
export const viewDaily = pgTable(
  'cms_view_daily',
  {
    day: date('day').notNull(),
    metric: varchar('metric', { length: 40 }).notNull(),
    count: bigint('count', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.day, table.metric] }),
    index('cms_view_daily_metric_day_idx').on(table.metric, table.day),
  ],
)

// The cumulative watermark for each Redis generation makes repeated/concurrent flushes idempotent.
export const viewBatches = pgTable(
  'cms_view_batches',
  {
    batchId: varchar('batch_id', { length: 32 }).notNull(),
    day: date('day').notNull(),
    metric: varchar('metric', { length: 40 }).notNull(),
    count: bigint('count', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.batchId, table.metric] })],
)
