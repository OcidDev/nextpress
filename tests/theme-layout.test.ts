import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultAppearance } from '../lib/content/appearance'
import { defaultSettings } from '../lib/content/settings'
import { createOptionsApi, type OptionRow } from '../lib/core/options'
import { layoutChrome, themeLayoutSchema, permittedLayout } from '../lib/themes/layout'
import {
  claimLegacyAppearance,
  readLayoutDocuments,
  writeLayoutEnvelope,
  themeAppearanceKeys,
} from '../lib/themes/layout-storage'
import { validateThemePackage, type ThemeFiles } from '../lib/themes/package'
import { customizationSchema, themeCustomizationStyle } from '../lib/themes/customization'

function fixture(id: string) {
  const defaults = layoutChrome(defaultAppearance())
  defaults.header.layout = 'centered'
  const files: ThemeFiles = Object.fromEntries(
    Object.entries({
      'theme.manifest.json': JSON.stringify({ id, name: id, version: '1.0.0' }),
      'theme.json': JSON.stringify({ version: 3 }),
      'templates/index.json': JSON.stringify({
        schemaVersion: 1,
        blocks: [{ block: 'core/site-title' }],
      }),
      'layout.json': JSON.stringify({
        version: 1,
        panels: ['header', 'home', 'sidebar'],
        defaults,
      }),
    }).map(([key, value]) => [key, Buffer.from(value).toString('base64')]),
  )
  return validateThemePackage(files)
}
function options() {
  const rows = new Map<string, OptionRow>()
  return createOptionsApi({
    autoload: async () => [],
    read: async (names) => names.flatMap((name) => (rows.has(name) ? [rows.get(name)!] : [])),
    write: async (row) => {
      rows.set(row.name, row)
      return true
    },
    delete: async (name) => rows.delete(name),
  })
}
test('layout package accepts declarative panels but rejects site ownership and unsafe references', () => {
  const pkg = fixture('layout-test')
  assert.equal(pkg.layout?.defaults.header.layout, 'centered')
  assert.throws(() =>
    themeLayoutSchema.parse({
      ...pkg.layout,
      defaults: { ...pkg.layout!.defaults, site: defaultSettings() },
    }),
  )
  assert.throws(() =>
    themeLayoutSchema.parse({
      ...pkg.layout,
      defaults: {
        ...pkg.layout!.defaults,
        home: { ...pkg.layout!.defaults.home, pageId: 'a'.repeat(32) },
      },
    }),
  )
  assert.throws(() =>
    themeLayoutSchema.parse({
      ...pkg.layout,
      defaults: {
        ...pkg.layout!.defaults,
        announcement: {
          enabled: true,
          text: 'X',
          buttonLabel: 'X',
          buttonHref: 'javascript:alert(1)',
        },
      },
    }),
  )
  assert.throws(() => themeLayoutSchema.parse({ ...pkg.layout, panels: ['header', 'header'] }))
  assert.throws(() =>
    validateThemePackage({ ...pkg.files, 'editor.js': Buffer.from('alert(1)').toString('base64') }),
  )
})
test('duplicate section and widget IDs in package defaults are rejected', () => {
  const pkg = fixture('layout-test')
  const defaults = structuredClone(pkg.layout!.defaults)
  defaults.sidebar[0]!.id = defaults.home.sections[0]!.id
  assert.throws(() => themeLayoutSchema.parse({ ...pkg.layout, defaults }))
})
test('a layout only changes declared panels; site identity and home routing remain core owned', () => {
  const pkg = fixture('layout-test')
  const current = defaultAppearance(),
    submitted = structuredClone(current)
  current.site.name = 'Core identity'
  submitted.site.name = 'Injected identity'
  submitted.home.mode = 'page'
  submitted.home.pageId = 'a'.repeat(32)
  submitted.article.comments = false
  submitted.header.search = false
  const result = permittedLayout(current, submitted, pkg.layout!)
  assert.equal(result.site.name, 'Core identity')
  assert.equal(result.home.mode, 'posts')
  assert.equal(result.home.pageId, '')
  assert.equal(result.article.comments, true)
  assert.equal(result.header.search, false)
})
test('legacy revisions migrate once to their owner, retaining backup and plugin options', async () => {
  const api = options(),
    a = fixture('layout-a'),
    b = fixture('layout-b')
  const old = defaultAppearance()
  old.header.search = false
  await api.updateOption('active_theme', 'layout-a')
  await api.updateOption('appearance:active', { revision: 4, config: old })
  await api.updateOption('plugin:keep:settings', { enabled: true })
  assert.equal((await readLayoutDocuments(api, a)).active.config.header.search, false)
  assert.equal((await readLayoutDocuments(api, b)).active.config.header.search, true)
  await claimLegacyAppearance(api)
  await api.updateOption('active_theme', 'layout-b')
  await claimLegacyAppearance(api)
  assert.equal(await api.getOption('appearance:legacy-owner'), 'layout-a')
  assert.equal((await readLayoutDocuments(api, a)).active.revision, 4)
  assert.equal((await readLayoutDocuments(api, b)).active.revision, 0)
  assert.deepEqual(await api.getOption('plugin:keep:settings'), { enabled: true })
  assert.deepEqual(await api.getOption('appearance:active'), { revision: 4, config: old })
})
test('theme revisions contain no site data; current core settings override old revisions', async () => {
  const api = options(),
    pkg = fixture('layout-test'),
    config = defaultAppearance()
  config.site.name = 'Stale identity'
  await writeLayoutEnvelope(api, themeAppearanceKeys('layout-test').active, { revision: 2, config })
  const stored = (await api.getOption(themeAppearanceKeys('layout-test').active)) as {
    config: Record<string, unknown>
  }
  assert.equal('site' in stored.config, false)
  assert.equal('pageId' in (stored.config.home as object), false)
  const site = defaultSettings()
  site.name = 'Current identity'
  site.showOnFront = 'page'
  site.pageOnFront = 'b'.repeat(32)
  await api.updateOption('site', site)
  const result = await readLayoutDocuments(api, pkg)
  assert.equal(result.active.config.site.name, 'Current identity')
  assert.equal(result.active.config.home.pageId, 'b'.repeat(32))
})
test('deleted theme revisions and discarded previous states never resurrect the legacy backup', async () => {
  const api = options(),
    pkg = fixture('layout-test'),
    config = defaultAppearance()
  config.header.layout = 'standard'
  await api.updateOption('active_theme', 'layout-test')
  await api.updateOption('appearance:active', { revision: 5, config })
  await api.updateOption('appearance:previous', { revision: 4, config })
  await claimLegacyAppearance(api)
  for (const key of Object.values(themeAppearanceKeys('layout-test'))) await api.deleteOption(key)
  const result = await readLayoutDocuments(api, pkg)
  assert.equal(result.active.revision, 0)
  assert.equal(result.active.config.header.layout, 'centered')
  assert.equal(result.previous, undefined)
})
test('sparse CSS overrides preserve inherited mode/palette and reject CSS injection', () => {
  const config = customizationSchema.parse({
    version: 1,
    inheritDefaults: true,
    controls: [
      {
        id: 'accent',
        label: 'Accent',
        group: 'Warna',
        type: 'color',
        default: '#123456',
        cssProperties: ['--linkC'],
      },
    ],
  })
  assert.deepEqual(themeCustomizationStyle(config, {}), {})
  assert.deepEqual(themeCustomizationStyle(config, { accent: '#abcdef' }), {
    '--theme--custom--accent': '#abcdef',
    '--linkC': '#abcdef',
  })
  assert.throws(() =>
    customizationSchema.parse({
      ...config,
      controls: [{ ...config.controls[0], cssProperties: ['color; background: url(evil)'] }],
    }),
  )
})

// The submitted object can be valid before undeclared panels are restored.
test('merged panels are revalidated before persisting a theme revision', async () => {
  const api = options(),
    pkg = fixture('layout-test')
  pkg.layout!.panels = ['home']
  const current = defaultAppearance(),
    submitted = structuredClone(current)
  submitted.home.sections[0]!.id = current.sidebar[0]!.id
  submitted.sidebar = []
  const merged = permittedLayout(current, submitted, pkg.layout!)
  const key = themeAppearanceKeys('layout-test').draft
  await assert.rejects(writeLayoutEnvelope(api, key, { revision: 1, config: merged }))
  assert.equal(await api.getOption(key), undefined)
})
