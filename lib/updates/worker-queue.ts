import type { Pool } from 'pg'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import {
  installSelfHostedUpdate,
  type LocalUpdateJob,
  type WorkerConfig,
} from './self-hosted-worker'

/** One durable cycle. A session lock excludes other workers; the filesystem lock
 * protects an interrupted install even after losing the database connection. */
export async function runWorkerCycle(
  pool: Pool,
  config: WorkerConfig,
  install = installSelfHostedUpdate,
): Promise<'idle' | 'busy' | 'installed' | 'failed' | 'blocked'> {
  const client = await pool.connect()
  let acquired = false
  let pulse: ReturnType<typeof setInterval> | undefined
  let disconnected = false
  const onError = () => {
    disconnected = true
  }
  client.on('error', onError)
  const heartbeat = async (ready: boolean) => {
    await pool.query(
      `insert into cms_options(name,value) values ('updates:worker',$1)
      on conflict(name) do update set value=excluded.value, updated_at=now()`,
      [JSON.stringify({ at: new Date().toISOString(), ready })],
    )
  }
  try {
    acquired = (
      await client.query(
        "select pg_try_advisory_lock(hashtext('cms-local-update-worker')) as acquired",
      )
    ).rows[0].acquired
    if (!acquired) return 'busy'
    const interrupted = await access(join(config.root, 'updates', 'active')).then(
      () => true,
      () => false,
    )
    if (interrupted) {
      await heartbeat(false)
      await client.query(
        "update update_jobs set status='failed', detail='Worker terputus atau pemulihan gagal. Periksa journal dan backup pada server sebelum membuka kunci worker.', finished_at=now(), updated_at=now() where adapter='self-hosted' and status in ('queued','deploying')",
      )
      return 'blocked'
    }
    await client.query(
      "update update_jobs set status='failed', detail='Worker terputus sebelum pemasangan selesai. Periksa kondisi instalasi sebelum mencoba lagi.', finished_at=now(), updated_at=now() where adapter='self-hosted' and status='deploying'",
    )
    await heartbeat(true)
    const result =
      await client.query(`update update_jobs set status='deploying', external_id='local_' || id, updated_at=now()
      where id=(select id from update_jobs where adapter='self-hosted' and status='queued' order by created_at limit 1)
      returning id, from_version as "fromVersion", to_version as "toVersion", tag, commit`)
    const job = result.rows[0] as LocalUpdateJob | undefined
    if (!job) return 'idle'
    pulse = setInterval(() => {
      void heartbeat(!disconnected).catch(() => {})
    }, 10_000)
    try {
      await install(config, job, async (message) => {
        if (disconnected) throw new Error('Koneksi antrean terputus.')
        await client.query('update update_jobs set detail=$2, updated_at=now() where id=$1', [
          job.id,
          message,
        ])
      })
      await client.query(
        "update update_jobs set status='ready', finished_at=now(), updated_at=now() where id=$1",
        [job.id],
      )
      return 'installed'
    } catch {
      await client.query(
        "update update_jobs set status='failed', detail=concat(detail, ' · gagal; periksa log privat dan backup pada server.'), finished_at=now(), updated_at=now() where id=$1",
        [job.id],
      )
      return 'failed'
    }
  } finally {
    clearInterval(pulse)
    try {
      if (acquired && !disconnected)
        await client.query("select pg_advisory_unlock(hashtext('cms-local-update-worker'))")
    } finally {
      client.off('error', onError)
      client.release(disconnected)
    }
  }
}
