import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Pool } from 'pg'
import { hashPassword } from 'better-auth/crypto'
import app from '../../package.json' with { type: 'json' }

test.skip(
  !process.env.TEST_RELEASE_FIXTURE,
  'Set TEST_RELEASE_FIXTURE for the isolated release server fixture',
)
const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const id = randomBytes(16).toString('hex')
const email = `updater-${id}@example.test`,
  password = randomBytes(24).toString('hex')
const keys = ['updates:check', 'updates:worker']
let saved: { name: string; value: unknown }[] = []
const version = '99.0.1',
  tag = 'v99.0.1',
  commit = 'c'.repeat(40)
const manifest = {
  name: 'nextpress',
  version,
  tag,
  commit,
  releasedAt: new Date().toISOString(),
  notes: 'Isolated updater fixture',
  requirements: { node: '22.0.0', packageManager: app.packageManager },
  rollbackSafe: true,
  migrations: { count: 4, upto: '0003_update_jobs' },
  source: {
    archive: `https://github.com/nextpress-test/release-fixture/releases/download/${tag}/nextpress-${version}.tar.gz`,
    bytes: 100,
    sha256: 'd'.repeat(64),
  },
}
async function setOption(name: string, value: unknown) {
  await db.query(
    'insert into cms_options(name,value) values($1,$2) on conflict(name) do update set value=excluded.value',
    [name, JSON.stringify(value)],
  )
}
async function seed(ready = true, rollbackSafe = true) {
  const latest = { ...manifest, rollbackSafe }
  await writeFile(
    resolve(process.env.TEST_RELEASE_FIXTURE!),
    JSON.stringify({ manifest: latest }),
    { mode: 0o600 },
  )
  await setOption('updates:worker', { ready, at: new Date().toISOString() })
  await setOption('updates:check', {
    checkedAt: new Date().toISOString(),
    installed: app.version,
    status: 'available',
    version,
    url: 'https://github.com/nextpress-test/release-fixture/releases/tag/v99.0.1',
    latest,
  })
}
test.beforeAll(async () => {
  assertIsolatedFixture()
  saved = (await db.query('select name,value from cms_options where name=any($1::text[])', [keys]))
    .rows
  // Never silently overwrite a real pending update if someone misconfigures the test DB.
  expect(
    (
      await db.query(
        "select count(*)::int as count from update_jobs where status in ('queued','deploying')",
      )
    ).rows[0].count,
  ).toBe(0)
  await mkdir(dirname(resolve(process.env.TEST_RELEASE_FIXTURE!)), { recursive: true })
  await db.query('insert into cms_user(id,name,email,role) values($1,$2,$3,$4)', [
    id,
    'Updater fixture',
    email,
    'administrator',
  ])
  await db.query(
    'insert into cms_account(id,account_id,user_id,provider_id,password) values($1,$2,$2,$3,$4)',
    [randomBytes(16).toString('hex'), id, 'credential', await hashPassword(password)],
  )
})
function assertIsolatedFixture() {
  if (!process.env.TEST_RELEASE_FIXTURE) throw new Error('Fixture path required')
}
test.afterAll(async () => {
  await db.query('delete from update_jobs where started_by=$1', [id])
  await db.query('delete from cms_options where name=any($1::text[])', [keys])
  for (const row of saved) await setOption(row.name, row.value)
  await db.query('delete from cms_user where id=$1', [id])
  await db.end()
  if (process.env.TEST_RELEASE_FIXTURE)
    await rm(resolve(process.env.TEST_RELEASE_FIXTURE), { force: true })
})
test.beforeEach(async ({ context }) => {
  await db.query("update cms_user set role='administrator' where id=$1", [id])
  await db.query('delete from update_jobs where started_by=$1', [id])
  await seed()
  await context.setExtraHTTPHeaders({ 'x-real-ip': `10.${[...randomBytes(3)].join('.')}` })
  const login = await context.request.post('/api/auth/sign-in/email', {
    headers: { origin: 'http://localhost:3109' },
    data: { email, password },
  })
  expect(login.status()).toBe(200)
})

test('dashboard queues the verified release and prevents a second request after the browser closes', async ({
  page,
  context,
}) => {
  await page.goto('/admin/updates')
  await expect(page.getByText('Isolated updater fixture')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Perbarui NextPress', exact: true })).toBeEnabled()
  const other = await context.newPage()
  await other.goto('/admin/updates')
  for (const p of [page, other])
    await p.getByRole('button', { name: 'Perbarui NextPress', exact: true }).click()
  await page.getByRole('button', { name: `Ya, pasang ${version}` }).click()
  await expect(page.getByText('Pembaruan dijadwalkan. Pantau status di bawah.')).toBeVisible()
  const jobs = (await db.query('select * from update_jobs where started_by=$1', [id])).rows
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    status: 'queued',
    adapter: 'self-hosted',
    tag,
    commit,
    to_version: version,
  })
  await page.close()
  await other.getByRole('button', { name: `Ya, pasang ${version}` }).click()
  await expect(other.locator('.adminNotice[role="alert"]')).toContainText(
    'Masih ada pembaruan berjalan',
  )
  expect(
    (await db.query('select count(*)::int as count from update_jobs where started_by=$1', [id]))
      .rows[0].count,
  ).toBe(1)
  await other.close()
})

test('dashboard blocks missing workers, schema changes and users without update_core', async ({
  page,
}) => {
  await seed(false)
  await page.goto('/admin/updates')
  await expect(page.getByRole('button', { name: 'Perbarui NextPress', exact: true })).toBeDisabled()
  await seed(true, false)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Perbarui NextPress', exact: true })).toBeDisabled()
  await expect(
    page.getByText('Rilis ini mengubah skema database. Jadwalkan maintenance dengan operator.'),
  ).toBeVisible()
  await db.query("update cms_user set role='editor' where id=$1", [id])
  await page.goto('/admin/updates')
  await expect(page).toHaveURL(/\/admin\?denied=1$/)
})

test('a stale dashboard cannot queue an update after the administrator role is revoked', async ({
  page,
}) => {
  await page.goto('/admin/updates')
  await page.getByRole('button', { name: 'Perbarui NextPress', exact: true }).click()
  await db.query("update cms_user set role='editor' where id=$1", [id])
  await page.getByRole('button', { name: `Ya, pasang ${version}` }).click()
  await expect(page).toHaveURL(/\/admin\?denied=1$/)
  expect(
    (await db.query('select count(*)::int as count from update_jobs where started_by=$1', [id]))
      .rows[0].count,
  ).toBe(0)
})
