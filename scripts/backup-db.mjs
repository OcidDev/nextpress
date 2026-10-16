import nextEnv from '@next/env'
import { spawnSync } from 'node:child_process'
import { closeSync, openSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { postgresEnv } from './postgres-env.mjs'
nextEnv.loadEnvConfig(process.cwd())
const destination = process.argv[2]
if (!destination || !process.env.DATABASE_URL)
  throw new Error('Usage: pnpm db:backup <file.dump>; configure DATABASE_URL first.')
// Validate before opening the destination: bad configuration must not leave an
// empty file that looks like a completed backup and blocks the next attempt.
const connectionEnv = postgresEnv(process.env.DATABASE_URL)
const path = resolve(destination)
mkdirSync(dirname(path), { recursive: true })
const output = openSync(path, 'wx', 0o600)
const result = spawnSync(
  'pg_dump',
  [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--exclude-table-data=cms_session',
    '--exclude-table-data=cms_verification',
    '--exclude-table-data=cms_rate_limit',
    '--exclude-table-data=cms_comment_limits',
  ],
  {
    env: { ...process.env, ...connectionEnv },
    stdio: ['ignore', output, 'pipe'],
  },
)
closeSync(output)
if (result.error || result.status !== 0) {
  rmSync(path, { force: true })
  throw new Error('Backup failed. Ensure pg_dump is installed and the database is reachable.')
}
console.log(`Backup tersimpan: ${path}`)
