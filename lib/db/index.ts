import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

// Lazy initialization keeps static theme builds independent of database access.
const globalDb = globalThis as unknown as { blogPool?: Pool; blogDb?: ReturnType<typeof createDb> }
function createDb(pool: Pool) {
  return drizzle(pool, { schema })
}
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum dikonfigurasi')
  const pool = (globalDb.blogPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
  }))
  // Idle clients can fail between requests when PostgreSQL restarts.
  // Keep the process alive; query failures still propagate to their callers.
  if (pool.listenerCount('error') === 0)
    pool.on('error', (error: NodeJS.ErrnoException) => {
      console.error('[PostgreSQL] Koneksi idle terputus.', { code: error.code || 'UNKNOWN' })
    })
  return pool
}
export function getDb() {
  const pool = getPool()
  return (globalDb.blogDb ??= createDb(pool))
}
export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL)
}
export { schema }
