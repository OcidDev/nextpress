import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { validateThemePackage } from '../../lib/themes/package'
import { initialRoles } from '../../lib/core/roles'

const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const userId = randomBytes(16).toString('hex')
const themeId = `settings-${userId.slice(0, 10)}`
const email = `${themeId}@example.test`,
  password = randomBytes(24).toString('hex')
let savedOptions: { name: string; value: unknown }[] = []
const keys = ['site', 'active_theme', 'core:roles']
const option = async (name: string) =>
  (await db.query('select value from cms_options where name=$1', [name])).rows[0]?.value

test.beforeAll(async () => {
  savedOptions = (
    await db.query('select name,value from cms_options where name=any($1::text[])', [keys])
  ).rows
  await db.query('insert into cms_user(id,name,email,role) values($1,$2,$3,$4)', [
    userId,
    'Settings fixture',
    email,
    'administrator',
  ])
  await db.query(
    'insert into cms_account(id,account_id,user_id,provider_id,password) values($1,$2,$2,$3,$4)',
    [randomBytes(16).toString('hex'), userId, 'credential', await hashPassword(password)],
  )
  const pkg = validateThemePackage(
    Object.fromEntries(
      Object.entries({
        'theme.manifest.json': { id: themeId, name: 'Settings preview fixture', version: '1.0.0' },
        'theme.json': { version: 3 },
        'templates/index.json': {
          schemaVersion: 1,
          blocks: [
            { block: 'core/site-title' },
            { block: 'core/site-footer', props: { layout: 'compact' } },
          ],
        },
      }).map(([name, value]) => [name, Buffer.from(JSON.stringify(value)).toString('base64')]),
    ),
  )
  await db.query('insert into cms_theme_packages(id,hash,files) values($1,$2,$3)', [
    themeId,
    pkg.hash,
    JSON.stringify(pkg.files),
  ])
})
test.afterAll(async () => {
  await db.query('delete from cms_options where name=any($1::text[])', [keys])
  for (const row of savedOptions)
    await db.query('insert into cms_options(name,value) values($1,$2)', [
      row.name,
      JSON.stringify(row.value),
    ])
  await db.query('delete from cms_theme_packages where id=$1', [themeId])
  await db.query('delete from cms_user where id=$1', [userId])
  await db.end()
})
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-real-ip': `10.${[...randomBytes(3)].join('.')}` })
  expect(
    (
      await context.request.post('/api/auth/sign-in/email', {
        headers: { origin: 'http://localhost:3109' },
        data: { email, password },
      })
    ).status(),
  ).toBe(200)
})

test('site settings save inside customization, refresh preview, and survive theme changes', async ({
  page,
  request,
}) => {
  const initialActive = await option('active_theme')
  const navigate = async (section: string) => {
    await page.goto(`/admin/site-editor?theme=${themeId}&panel=site-${section}`)
    await expect(
      page.getByRole('heading', { name: 'Sesuaikan Settings preview fixture' }),
    ).toBeVisible()
  }
  const save = async (label = 'Simpan perubahan') => {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('.siteSettingsControls [role=alert]')).toHaveCount(0)
    await expect(page.locator('.siteSettingsControls').getByRole('status')).toContainText(
      /tersimpan/i,
    )
    await expect(page).toHaveURL(new RegExp(`/admin/site-editor\\?theme=${themeId}`))
  }
  await navigate('general')
  await expect(
    page.getByRole('navigation', { name: 'Pengaturan situs' }).getByRole('link'),
  ).toHaveCount(6)
  await expect(page.locator('.siteSettingsNotice')).toContainText('seluruh situs')
  await page.getByLabel('Judul situs', { exact: true }).fill('Shared site identity')
  // An unsaved form must not vanish silently when moving to another panel.
  page.once('dialog', (dialog) => dialog.dismiss())
  await page
    .getByRole('navigation', { name: 'Pengaturan situs' })
    .getByRole('link', { name: 'Menu', exact: true })
    .click()
  await expect(page.getByLabel('Judul situs', { exact: true })).toHaveValue('Shared site identity')
  await page.getByLabel('Slogan situs', { exact: true }).fill('Shared site description')
  await page
    .getByLabel('URL logo', { exact: true })
    .fill('http://localhost:3109/images/placeholder.webp')
  await page
    .getByLabel('URL ikon situs (favicon)', { exact: true })
    .fill('http://localhost:3109/icon.svg')
  await save()
  expect((await option('site')).name).toBe('Shared site identity')
  await expect(page.frameLocator('iframe').locator('body')).toContainText('Shared site identity')
  expect(await (await request.get('/')).text()).toContain('Shared site identity')
  expect(await option('active_theme')).toBe(initialActive ?? 'core-default')
  await navigate('menus')
  await page.getByRole('button', { name: 'Tambah menu', exact: true }).click()
  await page.getByLabel('Label menu', { exact: true }).last().fill('Shared menu')
  await page.getByLabel('URL menu', { exact: true }).last().fill('/archive')
  await save('Simpan menu')
  expect((await option('site')).navigation.at(-1).label).toBe('Shared menu')
  await navigate('footer')
  if (await page.getByRole('button', { name: 'Tambah kolom', exact: true }).isEnabled())
    await page.getByRole('button', { name: 'Tambah kolom', exact: true }).click()
  await page.getByLabel('Judul kolom', { exact: true }).last().fill('Shared footer')
  await save()
  expect((await option('site')).footer.at(-1).title).toBe('Shared footer')
  await navigate('social')
  await page.getByRole('button', { name: 'Tambah sosial', exact: true }).click()
  await page.getByLabel('Label sosial', { exact: true }).last().fill('Shared social')
  await page.getByLabel('URL sosial', { exact: true }).last().fill('https://example.test/profile')
  await save()
  expect((await option('site')).social.at(-1).label).toBe('Shared social')
  await navigate('reading')
  await page.getByLabel('Mode bawaan', { exact: true }).selectOption('light')
  await save()
  expect((await option('site')).defaultMode).toBe('light')
  await page.goto('/admin/settings/general')
  await expect(page.getByLabel('Judul situs', { exact: true })).toHaveValue('Shared site identity')
  await page.goto('/admin/settings/menus')
  await expect(page.getByLabel('Label menu', { exact: true }).last()).toHaveValue('Shared menu')
  await page.goto('/admin/appearance')
  await page
    .getByRole('heading', { name: 'Settings preview fixture', exact: true })
    .locator('../../..')
    .getByRole('button', { name: 'Aktifkan', exact: true })
    .click()
  await navigate('general')
  await expect(page.getByLabel('Judul situs', { exact: true })).toHaveValue('Shared site identity')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('Judul situs', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('theme customization capability does not grant permission to edit site settings', async ({
  page,
}) => {
  const roles = (await option('core:roles')) ?? initialRoles()
  roles.settings_test_designer = {
    label: 'Theme designer',
    capabilities: ['read', 'edit_theme_options'],
  }
  await db.query(
    "insert into cms_options(name,value) values('core:roles',$1) on conflict(name) do update set value=excluded.value",
    [JSON.stringify(roles)],
  )
  await db.query("update cms_user set role='settings_test_designer' where id=$1", [userId])
  await page.goto('/admin/site-editor?theme=core-default')
  await expect(page.getByRole('heading', { name: /Sesuaikan/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Pengaturan situs' })).toHaveCount(0)
  await page.goto('/admin/site-editor?theme=core-default&panel=site-general')
  await expect(page).toHaveURL(/\/admin\?denied=1$/)
  await expect(page.getByLabel('Judul situs', { exact: true })).toHaveCount(0)
})
