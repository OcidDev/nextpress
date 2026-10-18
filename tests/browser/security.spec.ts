import { test, expect } from '@playwright/test'
import { Pool } from 'pg'
import { randomBytes } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { consumePasswordAttempt } from '../../lib/password-rate-limit'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { initialRoles } from '../../lib/core/roles'

const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const id = randomBytes(16).toString('hex')
const email = `security-${id}@example.test`
const password = randomBytes(24).toString('hex')
let ipCounter = 1
const ipPrefix = [...randomBytes(2)].join('.')
const nextIp = () => `10.${ipPrefix}.${ipCounter++}`

test.beforeAll(async () => {
  await db.query('INSERT INTO cms_user(id,name,email,role) VALUES($1,$2,$3,$4)', [
    id,
    'Security fixture',
    email,
    'administrator',
  ])
  await db.query(
    'INSERT INTO cms_account(id,account_id,user_id,provider_id,password) VALUES($1,$2,$2,$3,$4)',
    [randomBytes(16).toString('hex'), id, 'credential', await hashPassword(password)],
  )
})
test.afterAll(async () => {
  await db.query('DELETE FROM authors WHERE user_id=$1', [id])
  await db.query('DELETE FROM cms_user WHERE id=$1', [id])
  await db.query('DELETE FROM cms_rate_limit WHERE key=$1', [`pwd-check:${id}`])
  await db.end()
})

test('parallel password checks consume at most five attempts', async () => {
  const attempts = await Promise.allSettled(
    Array.from({ length: 20 }, () => consumePasswordAttempt(drizzle(db), id)),
  )
  expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(5)
  expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(15)
})

for (const javaScriptEnabled of [true, false]) {
  test(`login sends credentials only in POST body (JavaScript ${javaScriptEnabled})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled,
      extraHTTPHeaders: { 'x-real-ip': nextIp() },
    })
    const page = await context.newPage()
    const urls: string[] = []
    page.on('request', (request) => urls.push(request.url()))
    await page.goto('http://localhost:3109/admin/login')
    await expect(page.locator('form')).toHaveAttribute('method', 'post')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Kata sandi', { exact: true }).fill(password)
    const sent = page.waitForRequest((request) => request.url().endsWith('/api/auth/sign-in/email'))
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    expect((await sent).method()).toBe('POST')
    await page.waitForURL('http://localhost:3109/admin')
    for (const url of urls) {
      expect(url).not.toContain(password)
      expect(url).not.toContain(encodeURIComponent(email))
      expect(new URL(url).searchParams.has('password')).toBe(false)
    }
    const cookies = await context.cookies()
    expect(
      cookies.some(
        (cookie) =>
          cookie.name.includes('session_token') && cookie.httpOnly && cookie.sameSite === 'Lax',
      ),
    ).toBe(true)
    await context.close()
  })
}

test('legacy credential query is removed without being reflected in redirect', async ({
  request,
}) => {
  const response = await request.get(
    '/admin/login?email=fixture%40example.test&password=legacy-secret',
    { maxRedirects: 0 },
  )
  expect(response.status()).toBe(303)
  const location = new URL(response.headers().location!, 'http://localhost:3109')
  expect(location.pathname).toBe('/admin/login')
  expect(location.search).toBe('')
  expect(response.headers()['referrer-policy']).toBe('no-referrer')
})

test('anonymous users cannot access admin data or private previews', async ({ request }) => {
  for (const path of [
    '/admin',
    '/admin/users',
    '/admin/site-editor',
    '/preview/appearance',
    '/api/admin/media',
  ]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    expect(response.headers().location).toContain('/admin/login')
  }
  expect((await request.get('/api/posts?preview=1')).status()).toBe(401)
  expect((await request.get('/api/cron/flush-views')).status()).toBe(401)
})

test('cross-origin login is rejected and signup is disabled', async ({ request }) => {
  const headers = { origin: 'https://evil.example', 'x-real-ip': nextIp() }
  const response = await request.post('/api/auth/sign-in/email', {
    headers,
    data: { email, password },
  })
  expect(response.status()).toBe(403)
  const form = await request.post('/api/auth/sign-in/email', {
    headers,
    form: { email, password },
    maxRedirects: 0,
  })
  expect(form.status()).toBe(303)
  expect(form.headers().location).toBe('/admin/login?notice=login_failed')
  expect(form.headers()['set-cookie'] || '').not.toContain('session_token')
  const signup = await request.post('/api/auth/sign-up/email', {
    headers: { origin: 'http://localhost:3109', 'x-real-ip': nextIp() },
    data: { email: `new-${email}`, password, name: 'Uninvited' },
  })
  expect(signup.status()).toBeGreaterThanOrEqual(400)
})

test('login rate limit survives changing untrusted forwarded IP', async ({ request }) => {
  const ip = nextIp()
  const statuses: number[] = []
  for (let i = 0; i < 6; i++) {
    const response = await request.post('/api/auth/sign-in/email', {
      headers: {
        origin: 'http://localhost:3109',
        'x-real-ip': ip,
        'x-forwarded-for': `198.51.100.${i + 1}`,
      },
      data: { email, password: 'wrong-password-for-test' },
    })
    statuses.push(response.status())
  }
  expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
  expect(statuses[5]).toBe(429)
})

test('custom user manager cannot downgrade or reset an administrator through a server action', async ({
  browser,
}) => {
  const managerId = randomBytes(16).toString('hex')
  const managerEmail = `manager-${managerId}@example.test`
  const managerPassword = randomBytes(24).toString('hex')
  const oldRoles = (await db.query("SELECT value FROM cms_options WHERE name='core:roles'")).rows[0]
    ?.value
  const roles = {
    ...(oldRoles || initialRoles()),
    security_manager: {
      label: 'Security manager',
      capabilities: ['read', 'edit_profile', 'edit_users', 'list_users'],
    },
  }
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': nextIp() } })
  try {
    await db.query(
      "INSERT INTO cms_options(name,value) VALUES('core:roles',$1) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      [JSON.stringify(roles)],
    )
    await db.query('INSERT INTO cms_user(id,name,email,role) VALUES($1,$2,$3,$4)', [
      managerId,
      'Manager fixture',
      managerEmail,
      'security_manager',
    ])
    await db.query(
      'INSERT INTO cms_account(id,account_id,user_id,provider_id,password) VALUES($1,$2,$2,$3,$4)',
      [
        randomBytes(16).toString('hex'),
        managerId,
        'credential',
        await hashPassword(managerPassword),
      ],
    )
    const page = await context.newPage()
    await page.goto('http://localhost:3109/admin/login')
    await page.getByLabel('Email', { exact: true }).fill(managerEmail)
    await page.getByLabel('Kata sandi', { exact: true }).fill(managerPassword)
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await page.waitForURL('http://localhost:3109/admin')
    await page.goto(`http://localhost:3109/admin/users/${id}`)
    await page.locator('select[name=role]').selectOption('subscriber')
    await page.locator('input[name=password]').fill(randomBytes(24).toString('hex'))
    await page.getByRole('button', { name: 'Simpan pengguna', exact: true }).click()
    await expect(page.locator('form').getByRole('alert')).toContainText('izin yang lebih tinggi')
    expect((await db.query('SELECT role FROM cms_user WHERE id=$1', [id])).rows[0].role).toBe(
      'administrator',
    )
  } finally {
    await context.close()
    await db.query('DELETE FROM authors WHERE user_id=$1', [managerId])
    await db.query('DELETE FROM cms_user WHERE id=$1', [managerId])
    if (oldRoles)
      await db.query("UPDATE cms_options SET value=$1 WHERE name='core:roles'", [
        JSON.stringify(oldRoles),
      ])
    else await db.query("DELETE FROM cms_options WHERE name='core:roles'")
  }
})

test('admin reset has no fallback or password output and revokes sessions', async () => {
  const run = promisify(execFile)
  const args = [
    'node_modules/tsx/dist/cli.mjs',
    'scripts/reset-admin-password.ts',
    `--email=${email}`,
  ]
  const env = {
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    NEW_ADMIN_PASSWORD: '',
  }
  const rejected = await run(process.execPath, args, { env, timeout: 15_000 }).then(
    () => false,
    () => true,
  )
  expect(rejected).toBe(true)
  const nextPassword = randomBytes(24).toString('hex')
  const result = await run(process.execPath, args, {
    env: { ...env, NEW_ADMIN_PASSWORD: nextPassword },
    timeout: 15_000,
  })
  expect(result.stdout + result.stderr).not.toContain(nextPassword)
  expect(
    (await db.query('SELECT count(*)::int AS n FROM cms_session WHERE user_id=$1', [id])).rows[0].n,
  ).toBe(0)
  expect((await db.query('SELECT role, active FROM cms_user WHERE id=$1', [id])).rows[0]).toEqual({
    role: 'administrator',
    active: true,
  })
})
