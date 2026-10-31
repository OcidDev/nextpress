import nextEnv from '@next/env'
import { Pool } from 'pg'
import { checkWorkerInstallation, workerConfig } from '../lib/updates/self-hosted-worker'
import { runWorkerCycle } from '../lib/updates/worker-queue'

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const config = workerConfig()
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
pool.on('error', () => {
  console.error('Koneksi idle worker terputus.')
})
let stopping = false
process.on('SIGTERM', () => {
  stopping = true
})
process.on('SIGINT', () => {
  stopping = true
})
try {
  await checkWorkerInstallation(config)
  do {
    const result = await runWorkerCycle(pool, config)
    if (result === 'blocked')
      console.error('Worker dikunci. Lihat docs/deployment/self-hosted-updates.md.')
    // Restart=always reloads the worker from the new current release.
    if (result === 'installed' || stopping || process.argv.includes('--once')) break
    await new Promise((resolve) => setTimeout(resolve, 5000))
  } while (!stopping)
} finally {
  await pool.end()
}
