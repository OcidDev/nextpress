import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { runWorkerCycle } from '../lib/updates/worker-queue'
import type { WorkerConfig } from '../lib/updates/self-hosted-worker'

test('persistent queue excludes concurrent workers, reports completion/failure, and blocks crash recovery', async () => {
  assert.ok(process.env.TEST_DATABASE_URL, 'An isolated TEST_DATABASE_URL is required')
  const schema = `updater_${randomBytes(8).toString('hex')}`
  const control = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  const url = new URL(process.env.TEST_DATABASE_URL)
  url.searchParams.set('options', `-c search_path=${schema}`)
  const pool = new Pool({ connectionString: url.toString(), max: 6 })
  const root = await mkdtemp(join(tmpdir(), 'nextpress-queue-test-'))
  const config: WorkerConfig = {
    root,
    env: process.env,
    restart: [process.execPath],
    origin: 'http://localhost',
  }
  try {
    await control.query(`create schema "${schema}"`)
    await pool.query(`create table cms_options(name text primary key, value jsonb, updated_at timestamptz default now());
      create table update_jobs(id text primary key, from_version text, to_version text, tag text, commit text, adapter text, status text, external_id text, detail text, created_at timestamptz default now(), updated_at timestamptz default now(), finished_at timestamptz);
      create unique index single_active on update_jobs ((true)) where status in ('queued','deploying');`)
    const seed = async (id: string, adapter = 'self-hosted', status = 'queued') =>
      pool.query(
        "insert into update_jobs(id,from_version,to_version,tag,commit,adapter,status) values ($1,'1.0.0','1.0.1','v1.0.1',$2,$3,$4)",
        [id, 'b'.repeat(40), adapter, status],
      )
    const row = async (id: string) =>
      (await pool.query('select * from update_jobs where id=$1', [id])).rows[0]
    await seed('first')
    await assert.rejects(
      seed('duplicate'),
      (error: unknown) => (error as { code: string }).code === '23505',
    )
    let unlock!: () => void, entered!: () => void
    const gate = new Promise<void>((resolve) => {
      unlock = resolve
    })
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const first = runWorkerCycle(pool, config, async (_config, job, progress) => {
      assert.equal(job.id, 'first')
      await progress('Fixture build')
      entered()
      await gate
      return { backup: 'fixture', stage: 'fixture' }
    })
    await started
    try {
      assert.equal((await row('first')).status, 'deploying')
      assert.equal(await runWorkerCycle(pool, config), 'busy')
    } finally {
      unlock()
    }
    assert.equal(await first, 'installed')
    assert.equal((await row('first')).status, 'ready')
    assert.ok((await row('first')).finished_at)
    await seed('failure')
    assert.equal(
      await runWorkerCycle(pool, config, async () => {
        throw new Error('password=secret-do-not-display')
      }),
      'failed',
    )
    assert.equal((await row('failure')).status, 'failed')
    assert.doesNotMatch((await row('failure')).detail, /password|secret/)
    await seed('abandoned', 'self-hosted', 'deploying')
    assert.equal(await runWorkerCycle(pool, config), 'idle')
    assert.equal((await row('abandoned')).status, 'failed')
    await seed('crashed', 'self-hosted', 'deploying')
    await mkdir(join(root, 'updates/active'), { recursive: true })
    assert.equal(await runWorkerCycle(pool, config), 'blocked')
    assert.equal((await row('crashed')).status, 'failed')
    assert.equal(
      (await pool.query("select value from cms_options where name='updates:worker'")).rows[0].value
        .ready,
      false,
    )
    await rm(join(root, 'updates/active'), { recursive: true })
    await seed('provider', 'vercel')
    assert.equal(await runWorkerCycle(pool, config), 'idle')
    assert.equal((await row('provider')).status, 'queued')
  } finally {
    await pool.end()
    await control.query(`drop schema "${schema}" cascade`)
    await control.end()
    await rm(root, { recursive: true, force: true })
  }
})
