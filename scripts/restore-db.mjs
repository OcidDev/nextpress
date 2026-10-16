import nextEnv from '@next/env'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { postgresEnv } from './postgres-env.mjs'
nextEnv.loadEnvConfig(process.cwd())
const source = process.argv[2],
  confirmation = process.argv[3]
if (!source || !process.env.RESTORE_DATABASE_URL)
  throw new Error(
    'Usage: pnpm db:restore <file.dump> <target-database-name>; configure RESTORE_DATABASE_URL separately.',
  )
const target = new URL(process.env.RESTORE_DATABASE_URL),
  databaseName = decodeURIComponent(target.pathname.slice(1))
if (!databaseName || confirmation !== databaseName)
  throw new Error('Target database name confirmation must match RESTORE_DATABASE_URL.')
const input = resolve(source)
if (!existsSync(input)) throw new Error('Backup file not found.')
const result = spawnSync(
  'pg_restore',
  [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    '--single-transaction',
    '--dbname',
    databaseName,
    input,
  ],
  {
    env: {
      ...process.env,
      ...postgresEnv(process.env.RESTORE_DATABASE_URL),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  },
)
if (result.error || result.status !== 0)
  throw new Error(
    'Restore failed. Ensure pg_restore is installed and the target database is reachable.',
  )
console.log(`Backup dipulihkan ke database ${databaseName}. Sesi login tidak ikut dipulihkan.`)
