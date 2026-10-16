import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import type { getDb } from './index'
import { options, transients } from './core-schema'
import {
  AUTOLOAD_BUDGET_BYTES,
  AUTOLOAD_MAX_KEYS,
  type OptionRow,
  type OptionStore,
} from '@/lib/core/options'
import type { TransientStore } from '@/lib/core/transients'

export type CoreDatabase = Pick<
  ReturnType<typeof getDb>,
  'select' | 'insert' | 'delete' | 'execute'
>

export function createPostgresOptionStore(db: CoreDatabase): OptionStore {
  return {
    async autoload() {
      // Limit transferred JSON bytes, not merely the number of decoded rows.
      const result = await db.execute(sql`
        select name, value, autoload, legacy from (
          select name, value, autoload, legacy,
            sum(octet_length(value::text)) over (order by name) as total_bytes
          from cms_options where autoload = true
        ) bounded where total_bytes <= ${AUTOLOAD_BUDGET_BYTES}
        order by name limit ${AUTOLOAD_MAX_KEYS}
      `)
      return result.rows as OptionRow[]
    },
    async read(names) {
      if (!names.length) return []
      return db
        .select({
          name: options.name,
          value: options.value,
          autoload: options.autoload,
          legacy: options.legacy,
        })
        .from(options)
        .where(inArray(options.name, names))
    },
    async write(row, mode, flags) {
      // An omitted flag preserves existing autoload, but larger values must
      // become demand-loaded. Keep this decision atomic with the upsert.
      const nextAutoload = flags?.preserveAutoload
        ? sql`${options.autoload} and octet_length(excluded.value::text) <= 65536`
        : sql`excluded.autoload`
      const insert = db.insert(options).values({
        ...row,
        // Explicit cast preserves JSON null instead of writing SQL NULL.
        value: sql`${JSON.stringify(row.value)}::jsonb`,
      })
      const query =
        mode === 'add'
          ? insert.onConflictDoNothing({ target: options.name })
          : insert.onConflictDoUpdate({
              target: options.name,
              set: {
                value: sql`excluded.value`,
                autoload: nextAutoload,
                legacy: sql`${options.legacy} or excluded.legacy`,
                updatedAt: new Date(),
              },
              setWhere: sql`${options.value} is distinct from excluded.value
          or ${options.autoload} is distinct from (${nextAutoload})
          or (not ${options.legacy} and excluded.legacy)`,
            })
      return (await query.returning({ name: options.name })).length > 0
    },
    async delete(name) {
      return (
        (await db.delete(options).where(eq(options.name, name)).returning({ name: options.name }))
          .length > 0
      )
    },
  }
}

export function createPostgresTransientStore(db: CoreDatabase): TransientStore {
  return {
    async get(name) {
      const [row] = await db
        .select({ value: transients.value })
        .from(transients)
        .where(and(eq(transients.name, name), gt(transients.expiresAt, sql`now()`)))
      return row?.value
    },
    async set(name, value, ttlSeconds) {
      const expiresAt = sql`now() + ${ttlSeconds} * interval '1 second'`
      await db
        .insert(transients)
        .values({ name, value: sql`${JSON.stringify(value)}::jsonb`, expiresAt })
        .onConflictDoUpdate({
          target: transients.name,
          set: { value: sql`excluded.value`, expiresAt },
        })
    },
    async delete(name) {
      await db.delete(transients).where(eq(transients.name, name))
    },
  }
}
