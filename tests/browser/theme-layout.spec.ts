import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { zipSync, strToU8 } from 'fflate'
import { defaultAppearance } from '../../lib/content/appearance'
import { layoutChrome } from '../../lib/themes/layout'

const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const userId = randomBytes(16).toString('hex')
const themeId = `layout-${userId.slice(0, 10)}`
const email = `${themeId}@example.test`,
  password = randomBytes(24).toString('hex')
const themeName = 'Declarative layout fixture'

test.beforeAll(async () => {
  await db.query('INSERT INTO cms_user(id,name,email,role) VALUES($1,$2,$3,$4)', [
    userId,
    'Layout fixture',
    email,
    'administrator',
  ])
  await db.query(
    'INSERT INTO cms_account(id,account_id,user_id,provider_id,password) VALUES($1,$2,$2,$3,$4)',
    [randomBytes(16).toString('hex'), userId, 'credential', await hashPassword(password)],
  )
})
test.afterAll(async () => {
  await db.query(
    "UPDATE cms_options SET value='\"core-default\"'::jsonb WHERE name='active_theme' AND value=$1::jsonb",
    [JSON.stringify(themeId)],
  )
  await db.query('DELETE FROM cms_theme_packages WHERE id=$1', [themeId])
  await db.query('DELETE FROM cms_options WHERE name LIKE $1', [`theme:${themeId}:%`])
  await db.query('DELETE FROM cms_user WHERE id=$1', [userId])
  await db.end()
})

test('declarative theme: all panels, private drafts, apply, stale tabs, restore, switch and uninstall isolation', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(180_000)
  await context.setExtraHTTPHeaders({ 'x-real-ip': `10.${[...randomBytes(3)].join('.')}` })
  expect(
    (
      await context.request.post('/api/auth/sign-in/email', {
        headers: { origin: 'http://localhost:3109' },
        data: { email, password },
      })
    ).status(),
  ).toBe(200)
  page.on('dialog', (dialog) => dialog.accept())
  const defaults = layoutChrome(defaultAppearance())
  const files = {
    'theme.manifest.json': { id: themeId, name: themeName, version: '1.0.0' },
    'theme.json': { version: 3 },
    'templates/index.json': {
      schemaVersion: 1,
      blocks: [
        { block: 'core/site-header' },
        {
          block: 'core/content-layout',
          props: { sidebar: true },
          children: [{ block: 'core/home-sections' }],
        },
        { block: 'core/site-footer' },
      ],
    },
    'layout.json': {
      version: 1,
      panels: ['style', 'header', 'home', 'article', 'sidebar', 'footer'],
      defaults,
      presets: [{ id: 'default', name: 'Default fixture', config: defaults }],
    },
  }
  const zip = Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, value]) => [name, strToU8(JSON.stringify(value))]),
      ),
    ),
  )
  await page.goto('/admin/appearance')
  await page.getByRole('button', { name: '+ Unggah Tema Baru', exact: true }).click()
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'layout.zip', mimeType: 'application/zip', buffer: zip })
  await page.getByRole('button', { name: 'Pasang Sekarang', exact: true }).click()
  const card = () => page.getByRole('heading', { name: themeName, exact: true }).locator('../../..')
  await expect(card()).toBeVisible()
  await card().getByRole('link', { name: 'Sesuaikan', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(6)
  const tab = (name: string) => page.getByRole('tab', { name, exact: true }).click()
  await tab('Gaya')
  await page.getByLabel('Tampilkan simpan bacaan pada kartu', { exact: true }).check()
  await tab('Header')
  await page.getByLabel('Susunan header', { exact: true }).selectOption('centered')
  await page.getByLabel('Header tetap saat halaman digulir', { exact: true }).uncheck()
  await page.getByLabel('Tampilkan banner informasi', { exact: true }).check()
  await page.getByLabel('Pesan informasi', { exact: true }).fill('Private layout banner')
  await tab('Artikel')
  await page.getByLabel('Tampilkan daftar isi', { exact: true }).uncheck()
  await tab('Beranda')
  await expect(page.getByLabel('Jenis bagian baru')).toBeVisible()
  await tab('Sidebar')
  await expect(page.getByLabel('Jenis widget baru')).toBeVisible()
  await tab('Footer')
  await page.getByLabel('Teks copyright', { exact: true }).fill('Layout footer fixture')
  await page.getByRole('button', { name: 'Simpan rancangan', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Rancangan tersimpan.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Terapkan ke situs', exact: true })).toBeDisabled()
  await expect(page.frameLocator('iframe').locator('[data-theme-package]')).toHaveAttribute(
    'data-header-sticky',
    'false',
  )
  await expect(page.frameLocator('iframe').locator('body')).toContainText('Private layout banner')
  expect(await (await request.get('/')).text()).not.toContain('Private layout banner')
  expect(
    (await request.get(`/preview/theme/${themeId}?draft=1`, { maxRedirects: 0 })).status(),
  ).not.toBe(200)
  await page.goto('/admin/appearance')
  await card().getByRole('button', { name: 'Aktifkan', exact: true }).click()
  await card().getByRole('link', { name: 'Sesuaikan', exact: true }).click()
  await page.getByRole('button', { name: 'Terapkan ke situs', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Tampilan diterapkan' })).toBeVisible()
  const published = await (await request.get('/')).text()
  expect(published).toContain('Private layout banner')
  expect(published).toContain('Layout footer fixture')
  const stored = async (state: string) =>
    (
      await db.query('SELECT value FROM cms_options WHERE name=$1', [
        `theme:${themeId}:appearance:${state}`,
      ])
    ).rows[0]?.value
  expect((await stored('active')).config.article.toc).toBe(false)
  expect((await stored('active')).config.site).toBeUndefined()
  const stale = await context.newPage()
  await stale.goto(`/admin/site-editor?theme=${themeId}`)
  await stale.getByRole('tab', { name: 'Header', exact: true }).click()
  await stale.getByLabel('Tampilkan pencarian', { exact: true }).uncheck()
  await tab('Header')
  await page.getByLabel('Pesan informasi', { exact: true }).fill('Second draft')
  await page.getByRole('button', { name: 'Simpan rancangan', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Rancangan tersimpan.' })).toBeVisible()
  await stale.getByRole('button', { name: 'Simpan rancangan', exact: true }).click()
  await expect(stale.locator('.appearanceNotice[role=alert]')).toContainText('tab lain')
  await stale.close()
  await page.locator('summary').filter({ hasText: 'Rancangan dan pemulihan' }).click()
  await page.getByRole('button', { name: 'Buang rancangan', exact: true }).click()
  await expect
    .poll(async () => (await stored('draft')).config.announcement.text)
    .toBe('Private layout banner')
  await page.reload()
  await page.locator('summary').filter({ hasText: 'Rancangan dan pemulihan' }).click()
  await page.getByRole('button', { name: 'Pulihkan tampilan sebelumnya', exact: true }).click()
  await expect.poll(async () => (await stored('active')).config.announcement.enabled).toBe(false)
  await page.goto('/admin/appearance')
  await page
    .getByRole('heading', { name: 'Twenty Twenty-Four', exact: true })
    .locator('../../..')
    .getByRole('button', { name: 'Aktifkan', exact: true })
    .click()
  const before = (
    await db.query(
      "SELECT name,value FROM cms_options WHERE name='site' OR name LIKE 'plugin:%' ORDER BY name",
    )
  ).rows
  await card().getByRole('button', { name: /Hapus/ }).click()
  await expect(card()).toHaveCount(0)
  expect(
    (
      await db.query('SELECT * FROM cms_options WHERE name LIKE $1', [
        `theme:${themeId}:appearance:%`,
      ])
    ).rowCount,
  ).toBe(0)
  expect(
    (
      await db.query(
        "SELECT name,value FROM cms_options WHERE name='site' OR name LIKE 'plugin:%' ORDER BY name",
      )
    ).rows,
  ).toEqual(before)
})
