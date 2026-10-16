import nextEnv from '@next/env'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum dikonfigurasi.')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
})
const client = await pool.connect()
try {
  await client.query('begin read only')
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'))
  const {
    rows: [tables],
  } = await client.query("select to_regclass('drizzle.__drizzle_migrations') as migrations")
  const applied = tables.migrations
    ? (await client.query('select created_at from drizzle.__drizzle_migrations')).rows
    : []
  const timestamps = new Set(applied.map((row) => Number(row.created_at)))
  const pending = journal.entries.filter((entry) => !timestamps.has(entry.when))
  const {
    rows: [schema],
  } = await client.query(`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'categories' and column_name = 'parent_id'
    ) as category_hierarchy
  `)
  if (pending.length || !schema.category_hierarchy) {
    for (const entry of pending) console.error(`Belum diterapkan: ${entry.tag}`)
    if (!schema.category_hierarchy) console.error('Kolom categories.parent_id belum tersedia.')
    console.error(
      'Database belum siap untuk seluruh fitur admin. Tinjau migrasi dan backup sebelum deploy.',
    )
    process.exitCode = 1
  } else {
    console.log(
      `Database siap: ${journal.entries.length} migrasi tercatat; hierarki kategori tersedia.`,
    )
  }
  await client.query('rollback')
} finally {
  client.release()
  await pool.end()
}
