import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../lib/db/schema'
import nextEnv from '@next/env'
import { deleteThemeData, themeRemovalKey } from '../lib/themes/deletion'
import { validateThemePackage, type ThemeFiles } from '../lib/themes/package'
import { createOptionsApi, createOptionRegistry } from '../lib/core/options'
import { createPostgresOptionStore } from '../lib/db/core-store'
import { themeCustomizationStyle, validateThemeValues } from '../lib/themes/customization'

function theme(id: string, version = '1.0.0') {
  const files: ThemeFiles = Object.fromEntries(
    Object.entries({
      'theme.manifest.json': JSON.stringify({ id, name: id, version }),
      'theme.json': JSON.stringify({ version: 3 }),
      'templates/index.json': JSON.stringify({
        schemaVersion: 1,
        blocks: [{ block: 'core/site-title' }],
      }),
      'customizer.json': JSON.stringify({
        version: 1,
        controls: [
          { id: 'accent', label: 'Accent', group: 'Warna', type: 'color', default: '#123456' },
        ],
      }),
      'style.css': ':scope { color: var(--theme--custom--accent, #123456); }',
    }).map(([key, value]) => [key, Buffer.from(value).toString('base64')]),
  )
  return validateThemePackage(files)
}

test('package controls produce scoped CSS and reject undeclared settings', () => {
  const pkg = theme('design-test')
  assert.deepEqual(themeCustomizationStyle(pkg.customization!, { accent: '#abcdef' }), {
    '--theme--custom--accent': '#abcdef',
  })
  assert.throws(() => validateThemeValues(pkg.customization!, { site: 'overwrite core settings' }))
  assert.throws(() =>
    validateThemeValues(pkg.customization!, { accent: 'url(https://example.test)' }),
  )
  const plain = { ...pkg.files }
  delete plain['customizer.json']
  assert.equal(
    validateThemePackage(plain).customization,
    undefined,
    'Theme controls remain optional',
  )
})

test('theme uninstall preserves site/plugin data and guards active, stale and referenced packages', async (t) => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} })
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  assert.ok(url, 'A local or isolated PostgreSQL database is required')
  if (!process.env.TEST_DATABASE_URL)
    assert.ok(
      ['localhost', '127.0.0.1'].includes(new URL(url).hostname),
      'Refuse implicit testing on a remote database',
    )
  const namespace = `theme_test_${randomBytes(8).toString('hex')}`
  const control = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 })
  await control.query(`CREATE SCHEMA "${namespace}"`)
  const isolatedUrl = new URL(url)
  isolatedUrl.searchParams.set('options', `-c search_path=${namespace}`)
  const pool = new Pool({
    connectionString: isolatedUrl.toString(),
    connectionTimeoutMillis: 5000,
  })
  try {
    assert.equal((await pool.query('select current_schema() as schema')).rows[0].schema, namespace)
    await pool.query(`
      CREATE TABLE cms_options(name text primary key, value jsonb not null, autoload boolean not null default false, legacy boolean not null default false, updated_at timestamptz not null default now());
      CREATE TABLE cms_theme_packages(id text not null, hash text primary key, files jsonb not null, installed_at timestamptz not null default now());
      CREATE TABLE pages(id text primary key, title text, page_template text, status text);
      CREATE TABLE cms_plugins(id text primary key, config jsonb);
    `)
    const db = drizzle(pool, { schema })
    const core = theme('core-default'),
      old = theme('external-test'),
      latest = theme('external-test', '2.0.0')
    const setOption = (key: string, value: unknown) =>
      pool.query(
        'insert into cms_options(name,value) values($1,$2) on conflict(name) do update set value=excluded.value',
        [key, JSON.stringify(value)],
      )
    const seed = async () => {
      await pool.query('truncate cms_options, cms_theme_packages, pages, cms_plugins')
      await setOption('site', { name: 'Keep site identity', navigation: ['keep menu'] })
      await setOption('appearance:active', { content: 'Keep core widgets' })
      await setOption('plugin:keep:settings', { enabled: true })
      await setOption('active_theme', 'core-default')
      await setOption('previous_theme', 'external-test')
      await setOption('theme:external-test:customization', {
        revision: 2,
        active: { accent: '#abcdef' },
        draft: null,
      })
      await pool.query("insert into cms_plugins values ('keep-plugin', '{\"enabled\":true}')")
      for (const [index, pkg] of [old, latest].entries())
        await pool.query(
          'insert into cms_theme_packages(id,hash,files,installed_at) values($1,$2,$3,$4)',
          [
            pkg.manifest.id,
            pkg.hash,
            JSON.stringify(pkg.files),
            new Date(1700000000000 + index * 1000),
          ],
        )
    }
    const remove = (id = 'external-test', hash = latest.hash) =>
      db.transaction(async (tx) => {
        const options = createOptionsApi(createPostgresOptionStore(tx), createOptionRegistry())
        await deleteThemeData(tx, options, id, hash, [core])
      })
    await t.test('latest revision removes every version and only its own settings', async () => {
      await seed()
      const before = (
        await pool.query(
          "select name,value from cms_options where name in ('site','appearance:active','plugin:keep:settings') order by name",
        )
      ).rows
      await remove()
      assert.equal((await pool.query('select * from cms_theme_packages')).rowCount, 0)
      assert.equal(
        (
          await pool.query(
            "select * from cms_options where name in ('previous_theme','theme:external-test:customization')",
          )
        ).rowCount,
        0,
      )
      assert.deepEqual(
        (
          await pool.query(
            "select name,value from cms_options where name in ('site','appearance:active','plugin:keep:settings') order by name",
          )
        ).rows,
        before,
      )
      assert.equal((await pool.query('select * from cms_plugins')).rowCount, 1)
      assert.equal(
        (
          await pool.query('select value from cms_options where name=$1', [
            themeRemovalKey('external-test'),
          ])
        ).rows[0].value,
        true,
      )
    })
    await t.test('stale revision leaves all packages and settings intact', async () => {
      await seed()
      await assert.rejects(remove('external-test', old.hash), /berubah/)
      assert.equal((await pool.query('select * from cms_theme_packages')).rowCount, 2)
    })
    await t.test('active theme cannot be deleted', async () => {
      await seed()
      await setOption('active_theme', 'external-test')
      await assert.rejects(remove(), /sedang aktif/)
    })
    await t.test('previous theme serving as recovery cannot be deleted', async () => {
      await seed()
      await setOption('active_theme', 'missing-theme')
      await assert.rejects(remove(), /sedang aktif/)
    })
    await t.test('draft, published and trashed page references prevent deletion', async () => {
      for (const status of ['draft', 'published', 'trash']) {
        await seed()
        await pool.query('insert into pages values($1,$2,$3,$4)', [
          status,
          `Keep ${status}`,
          'theme:external-test:page-wide',
          status,
        ])
        await assert.rejects(remove(), /template halaman/)
        assert.equal((await pool.query('select * from pages')).rowCount, 1)
      }
    })
    await t.test(
      'inactive bundled default is removed from installation while internal files survive',
      async () => {
        await seed()
        await setOption('active_theme', 'external-test')
        await remove('core-default', core.hash)
        assert.equal(
          (
            await pool.query('select value from cms_options where name=$1', [
              themeRemovalKey('core-default'),
            ])
          ).rows[0].value,
          true,
        )
        assert.ok(validateThemePackage(core.files).templates.index)
      },
    )
    await t.test('internal default cannot be removed while serving recovery', async () => {
      await seed()
      await setOption('active_theme', 'missing-theme')
      await setOption('previous_theme', null)
      await assert.rejects(remove('core-default', core.hash), /sedang aktif/)
    })
    await t.test('invalid identifiers and duplicate uninstall requests are rejected', async () => {
      await seed()
      await assert.rejects(remove('../escape'), /tidak valid/)
      await remove()
      await assert.rejects(remove(), /sudah dihapus/)
    })
  } finally {
    await pool.end()
    await control.query(`DROP SCHEMA "${namespace}" CASCADE`)
    await control.end()
  }
})
