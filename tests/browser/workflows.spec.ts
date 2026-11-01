import { test, expect, type Page } from '@playwright/test'
import { Pool } from 'pg'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { hashPassword } from 'better-auth/crypto'
import sharp from 'sharp'
import { zipSync, unzipSync, strToU8 } from 'fflate'
import { exportWxr, importWxr } from '../../lib/core/tools'
import { IMPORT_MAX_BYTES } from '../../lib/import-limits'

const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const id = randomBytes(16).toString('hex')
const prefix = `qa-${id.slice(0, 10)}`
const email = `${prefix}@example.test`
const password = randomBytes(24).toString('hex')
const themeId = `${prefix}-theme`,
  themeName = `${prefix} theme`,
  pluginId = `${prefix}-plugin`

test.beforeAll(async () => {
  await db.query('INSERT INTO cms_user(id,name,email,role) VALUES($1,$2,$3,$4)', [
    id,
    'Workflow fixture',
    email,
    'administrator',
  ])
  await db.query(
    'INSERT INTO cms_account(id,account_id,user_id,provider_id,password) VALUES($1,$2,$2,$3,$4)',
    [randomBytes(16).toString('hex'), id, 'credential', await hashPassword(password)],
  )
})
test.beforeEach(async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ 'x-real-ip': `10.${[...randomBytes(3)].join('.')}` })
  const login = await context.request.post('/api/auth/sign-in/email', {
    headers: { origin: 'http://localhost:3109' },
    data: { email, password },
  })
  expect(login.status()).toBe(200)
  page.on('dialog', (dialog) => dialog.accept())
})
test.afterAll(async () => {
  await db.query(
    "UPDATE cms_options SET value='\"core-default\"'::jsonb WHERE name='active_theme' AND value=$1::jsonb",
    [JSON.stringify(themeId)],
  )
  await db.query('DELETE FROM cms_theme_packages WHERE id=$1', [themeId])
  await db.query('DELETE FROM cms_plugins WHERE id=$1', [pluginId])
  await db.query('DELETE FROM cms_editor_revisions WHERE author_id=$1', [id])
  await db.query('DELETE FROM cms_content WHERE author_id=$1 OR slug LIKE $2', [id, `${prefix}%`])
  await db.query('DELETE FROM posts WHERE author_id IN (SELECT id FROM authors WHERE user_id=$1)', [
    id,
  ])
  await db.query('DELETE FROM pages WHERE slug LIKE $1', [`${prefix}%`])
  await db.query('DELETE FROM cms_media WHERE uploaded_by=$1', [id])
  await db.query('DELETE FROM categories WHERE slug LIKE $1', [`${prefix}%`])
  await db.query('DELETE FROM cms_terms WHERE slug LIKE $1', [`${prefix}%`])
  await db.query('DELETE FROM authors WHERE user_id=$1', [id])
  await db.query('DELETE FROM cms_user WHERE id=$1', [id])
  await db.end()
})

async function html(page: Page, content: string) {
  if (!(await page.locator('textarea.editorHtmlSource').isVisible()))
    await page.getByRole('button', { name: 'HTML', exact: true }).click()
  await page.locator('textarea.editorHtmlSource').fill(content)
}

for (const kind of ['posts', 'pages'] as const) {
  test(`${kind}: draft, edit, revision restore, publish, trash, restore and delete`, async ({
    page,
    request,
  }) => {
    const slug = `${prefix}-${kind}`,
      title = `${prefix} ${kind}`
    const save = kind === 'posts' ? 'Simpan artikel' : 'Simpan halaman'
    await page.goto(`/admin/${kind}/new`)
    await page.getByLabel('Judul', { exact: true }).fill(title)
    await page.getByLabel('Slug', { exact: true }).fill(slug)
    await html(page, '<p>First workflow version</p>')
    await page.getByRole('button', { name: save, exact: true }).click()
    await page.waitForURL(new RegExp(`/admin/${kind}/[a-f0-9]{32}\\?saved=1`))
    const row = async () => (await db.query(`SELECT * FROM ${kind} WHERE slug=$1`, [slug])).rows[0]
    const first = await row(),
      contentId = first.id
    const publicPath = kind === 'posts' ? `/${slug}/` : `/${slug}`
    expect(first.status).toBe('draft')
    expect((await request.get(publicPath)).status()).toBe(404)
    await page.goto(`/admin/${kind}/${contentId}/preview`)
    await expect(page.locator('body')).toContainText('First workflow version')
    await page.goto(`/admin/${kind}/${contentId}`)
    await html(page, '<p>Second workflow version</p>')
    await page.getByRole('button', { name: save, exact: true }).click()
    await expect.poll(async () => (await row()).content).toContain('Second workflow version')
    const revision = (
      await db.query(
        'SELECT id FROM cms_editor_revisions WHERE content_id=$1 ORDER BY created_at LIMIT 1',
        [contentId],
      )
    ).rows[0]
    await page.goto(`/admin/${kind}/${contentId}/history?revision=${revision.id}`)
    await page.getByRole('button', { name: 'Pulihkan revisi ini', exact: true }).click()
    await expect.poll(async () => (await row()).content).toContain('First workflow version')
    await page.goto(`/admin/${kind}/${contentId}`)
    await page.locator('select[name=status]').selectOption('published')
    await page.getByRole('button', { name: save, exact: true }).click()
    await expect.poll(async () => (await row()).status).toBe('published')
    expect((await request.get(publicPath)).status()).toBe(200)
    expect(await (await request.get('/sitemap.xml')).text()).toContain(slug)
    await page.goto(`/admin/${kind}`)
    await page
      .getByRole('row')
      .filter({ hasText: title })
      .getByRole('button', { name: 'Ke Sampah', exact: true })
      .click()
    await expect.poll(async () => (await row()).status).toBe('trash')
    expect((await request.get(publicPath)).status()).toBe(404)
    await page.goto(`/admin/${kind}?status=trash`)
    await page
      .getByRole('row')
      .filter({ hasText: title })
      .getByRole('button', { name: 'Pulihkan sebagai draft', exact: true })
      .click()
    await expect.poll(async () => (await row()).status).toBe('draft')
    await page.goto(`/admin/${kind}`)
    await page
      .getByRole('row')
      .filter({ hasText: title })
      .getByRole('button', { name: 'Ke Sampah', exact: true })
      .click()
    await expect.poll(async () => (await row()).status).toBe('trash')
    await page.goto(`/admin/${kind}?status=trash`)
    await page
      .getByRole('row')
      .filter({ hasText: title })
      .getByRole('button', { name: 'Hapus permanen', exact: true })
      .click()
    await expect.poll(row).toBeUndefined()
    expect(
      (await db.query('SELECT id FROM cms_editor_revisions WHERE content_id=$1', [contentId]))
        .rowCount,
    ).toBe(0)
  })
}

test('media upload converts image, serves it publicly and saves metadata', async ({
  page,
  request,
}) => {
  const name = `${prefix}.png`
  const buffer = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#36a' } })
    .png()
    .toBuffer()
  await page.goto('/admin/media')
  if (!(await page.locator('input[type=file]').count()))
    await page.getByRole('button', { name: /Tambah/ }).click()
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer })
  await page.getByRole('button', { name: 'Unggah gambar', exact: true }).click()
  await expect
    .poll(async () => (await db.query('SELECT id FROM cms_media WHERE name=$1', [name])).rowCount)
    .toBe(1)
  const media = (await db.query('SELECT * FROM cms_media WHERE name=$1', [name])).rows[0]
  expect(media.mime_type).toBe('image/webp')
  const image = await request.get(`/api/media/${media.id}`)
  expect(image.headers()['content-type']).toBe('image/webp')
  expect(Buffer.compare(await image.body(), media.data)).toBe(0)
  await page.goto(`/admin/media/${media.id}`)
  await page.getByLabel('Teks alternatif', { exact: true }).fill('Updated accessible description')
  await page.getByRole('button', { name: 'Simpan detail media', exact: true }).click()
  await expect
    .poll(
      async () => (await db.query('SELECT alt FROM cms_media WHERE id=$1', [media.id])).rows[0].alt,
    )
    .toBe('Updated accessible description')
})

test('WordPress import validates size, supports dry-run, skips duplicates and exports content', async ({
  page,
}) => {
  const slug = `${prefix}-import`,
    title = `${prefix} Coffee & tea`
  const xml = exportWxr([
    {
      id: 'external',
      title,
      slug,
      content: '<p>Imported story</p>',
      status: 'draft',
      type: 'post',
      date: '2026-10-18T00:00:00Z',
      author: 'External',
    },
  ])
  await page.goto('/admin/tools/import')
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Jalankan Pengimpor WordPress' }) })
  const file = form.locator('input[type=file]')
  await file.setInputFiles({
    name: 'too-large.xml',
    mimeType: 'text/xml',
    buffer: Buffer.alloc(IMPORT_MAX_BYTES + 1, 32),
  })
  expect(await file.evaluate((node: HTMLInputElement) => node.validationMessage)).toContain(
    'maksimal 4 MB',
  )
  await file.setInputFiles({ name: 'fixture.xml', mimeType: 'text/xml', buffer: Buffer.from(xml) })
  await form.locator('input[name=dryRun]').check()
  await form.locator('button[type=submit]').click()
  await expect(form.getByRole('status')).toContainText('Simulasi berhasil')
  expect((await db.query('SELECT id FROM posts WHERE slug=$1', [slug])).rowCount).toBe(0)
  await form.locator('input[name=dryRun]').uncheck()
  await file.setInputFiles({ name: 'fixture.xml', mimeType: 'text/xml', buffer: Buffer.from(xml) })
  await form.locator('button[type=submit]').click()
  await expect(form.getByRole('status')).toContainText('1 entri ditambahkan')
  expect((await db.query('SELECT title FROM posts WHERE slug=$1', [slug])).rows[0].title).toBe(
    title,
  )
  await file.setInputFiles({ name: 'fixture.xml', mimeType: 'text/xml', buffer: Buffer.from(xml) })
  await form.locator('button[type=submit]').click()
  await expect(form.getByRole('status')).toContainText('1 dilewati')
  await page.goto('/admin/tools/export')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Unduh Berkas Ekspor' }).click()
  const saved = await download
  const exported = importWxr(await readFile((await saved.path())!, 'utf8'))
  expect(
    exported.items.some(
      (item) => item.slug === slug && item.title === title && item.status === 'draft',
    ),
  ).toBe(true)
})

test('Blogger imports posts and pages with label and draft status', async ({ page, request }) => {
  const slug = `${prefix}-blogger`
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><category term="http://schemas.google.com/blogger/2008/kind#post"/><title>${slug}</title><content type="html">&lt;p&gt;Blogger story&lt;/p&gt;</content><published>2026-10-17T00:00:00Z</published><category scheme="http://www.blogger.com/atom/ns#" term="${prefix}-label"/><link rel="alternate" href="https://example.test/${slug}.html"/></entry><entry><category term="http://schemas.google.com/blogger/2008/kind#page"/><title>${slug}-page</title><content>Private page</content><app:control><app:draft>yes</app:draft></app:control></entry></feed>`
  await page.goto('/admin/tools/import')
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Jalankan Pengimpor Blogger' }) })
  await form
    .locator('input[type=file]')
    .setInputFiles({ name: 'blogger.xml', mimeType: 'text/xml', buffer: Buffer.from(xml) })
  await form.locator('button[type=submit]').click()
  await expect(form.getByRole('status')).toContainText('2 artikel/laman diimpor')
  expect((await db.query('SELECT status FROM posts WHERE slug=$1', [slug])).rows[0].status).toBe(
    'published',
  )
  expect(
    (await db.query('SELECT status FROM pages WHERE slug=$1', [`${slug}-page`])).rows[0].status,
  ).toBe('draft')
  expect((await request.get(`/${slug}-page`)).status()).toBe(404)
  expect(
    (await db.query('SELECT id FROM categories WHERE slug=$1', [`${prefix}-label`])).rowCount,
  ).toBe(1)
})

test('plugin package installs inactive, activates in sandbox, deactivates and uninstalls', async ({
  page,
  request,
}) => {
  const manifest = {
    apiVersion: 1,
    id: pluginId,
    name: pluginId,
    version: '1.0.0',
    description: 'Workflow test',
    widgets: [{ id: 'main', name: 'Main', html: 'index.html' }],
  }
  const buffer = Buffer.from(
    zipSync({
      'plugin.json': strToU8(JSON.stringify(manifest)),
      'index.html': strToU8('<p>Workflow widget</p>'),
    }),
  )
  await page.goto('/admin/plugins')
  if (!(await page.getByRole('button', { name: 'Pasang plugin', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Tambah plugin' }).click()
  await page
    .getByLabel('Berkas ZIP plugin', { exact: true })
    .setInputFiles({ name: 'fixture.zip', mimeType: 'application/zip', buffer })
  await page.getByRole('button', { name: 'Pasang plugin', exact: true }).click()
  const card = page.getByRole('article', { name: pluginId, exact: true })
  await expect(card).toBeVisible()
  expect((await request.get(`/api/plugins/${pluginId}/main`)).status()).toBe(404)
  await card.getByRole('button', { name: 'Aktifkan', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Nonaktifkan', exact: true })).toBeVisible()
  const frame = await request.get(`/api/plugins/${pluginId}/main`)
  expect(frame.status()).toBe(200)
  expect(frame.headers()['content-security-policy']).toContain('sandbox allow-scripts')
  expect(await frame.text()).toContain('Workflow widget')
  await card.getByRole('button', { name: 'Nonaktifkan', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Aktifkan', exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Hapus plugin', exact: true }).click()
  await expect(card).toHaveCount(0)
})

test('theme package installs, activates, renders, switches back and deletes', async ({
  page,
  request,
}) => {
  const files = unzipSync(await readFile('public/themes/core-default.zip'))
  const manifest = JSON.parse(Buffer.from(files['theme.manifest.json']!).toString())
  files['theme.manifest.json'] = strToU8(
    JSON.stringify({ ...manifest, id: themeId, name: themeName }),
  )
  for (const name of ['style.css', 'theme.json'])
    if (files[name])
      files[name] = strToU8(
        Buffer.from(files[name]!).toString().replaceAll('theme-core-default-', `theme-${themeId}-`),
      )
  await page.goto('/admin/appearance')
  await page.getByRole('button', { name: '+ Unggah Tema Baru', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'theme.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(files)),
  })
  await page.getByRole('button', { name: 'Pasang Sekarang', exact: true }).click()
  const card = page.getByRole('heading', { name: themeName, exact: true }).locator('../../..')
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Aktifkan', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await db.query("SELECT value FROM cms_options WHERE name='active_theme'")).rows[0]?.value,
    )
    .toBe(themeId)
  expect(await (await request.get('/')).text()).toContain(`data-theme-package="${themeId}"`)
  const original = page
    .getByRole('heading', { name: 'Twenty Twenty-Four', exact: true })
    .locator('../../..')
  await original.getByRole('button', { name: 'Aktifkan', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await db.query("SELECT value FROM cms_options WHERE name='active_theme'")).rows[0]?.value,
    )
    .toBe('core-default')
  await card.getByRole('button', { name: /Hapus/ }).click()
  await expect(card).toHaveCount(0)
})
