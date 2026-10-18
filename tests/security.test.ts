import assert from 'node:assert/strict'
import { test } from 'node:test'
import { zipSync, strToU8 } from 'fflate'
import { cleanHtml } from '../lib/content/sanitize'
import { canManageRole, createRoleRegistry, currentUserCan, initialRoles } from '../lib/core/roles'
import { clientIp } from '../lib/client-ip'
import { readPluginPackage } from '../lib/plugins/package'
import { pluginFrameCsp, renderPluginFrame } from '../lib/plugins/frame'
import { scopeThemeCss } from '../lib/themes/package'
import { unsafeReleasePaths } from '../scripts/release-files.mjs'

test('release guard rejects real env, key, backup and test artifact files', () => {
  const paths = [
    '.env.local',
    'certs/server.pem',
    'db.dump',
    '.vercel/project.json',
    '.local/state.json',
    'test-results/login.json',
  ]
  assert.deepEqual(unsafeReleasePaths([...paths, '.env.example', 'LICENSE', 'lib/auth.ts']), paths)
})

test('HTML removes executable content and unsafe URLs, including obfuscated schemes', () => {
  const html = cleanHtml(
    '<script>alert(1)</script><img src="x" onerror="alert(1)">' +
      '<a href="jav&#x61;script:alert(1)" target="_blank">click</a>' +
      '<iframe src="https://evil.test"></iframe><p style="background:url(https://evil.test)">text</p>',
  )
  assert.doesNotMatch(html, /script|onerror|iframe|background|evil\.test/i)
  assert.match(html, /noopener noreferrer/)
})

test('contributors cannot publish, edit another author, or read another draft', () => {
  const actor = { id: 'a', role: 'contributor', active: true }
  const own = { type: 'post', status: 'draft', authorId: 'a' }
  assert.equal(currentUserCan(actor, 'edit_post', own), true)
  assert.equal(currentUserCan(actor, 'publish_posts'), false)
  assert.equal(currentUserCan(actor, 'edit_post', { ...own, authorId: 'b' }), false)
  assert.equal(currentUserCan(actor, 'read_post', { ...own, authorId: 'b' }), false)
  assert.equal(currentUserCan(null, 'read_post', own), false)
  assert.equal(currentUserCan({ ...actor, active: false }, 'edit_post', own), false)
})

test('custom user managers cannot take over a more privileged existing account', () => {
  const roles = createRoleRegistry({
    ...initialRoles(),
    manager: {
      label: 'User manager',
      capabilities: ['read', 'edit_profile', 'edit_users', 'list_users'],
    },
  })
  assert.equal(canManageRole('manager', 'administrator', roles), false)
  assert.equal(canManageRole('manager', 'admin', roles), false)
  assert.equal(canManageRole('manager', 'editor', roles), false)
  assert.equal(canManageRole('manager', 'subscriber', roles), true)
  assert.equal(canManageRole('administrator', 'manager', roles), true)
  assert.equal(canManageRole('subscriber', 'subscriber', roles), false)
})

test('IP buckets ignore forged forwarded headers and ambiguous chains', () => {
  const previous = process.env.NEXTPRESS_CLIENT_IP_HEADER
  process.env.NEXTPRESS_CLIENT_IP_HEADER = 'x-real-ip'
  try {
    assert.equal(
      clientIp(new Headers({ 'x-real-ip': '192.0.2.1', 'x-forwarded-for': '198.51.100.1' })),
      '192.0.2.1',
    )
    assert.equal(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.1' })), 'unknown')
    assert.equal(clientIp(new Headers({ 'x-real-ip': '198.51.100.1, 192.0.2.1' })), 'unknown')
    assert.equal(clientIp(new Headers({ 'x-real-ip': 'not-an-ip' })), 'unknown')
  } finally {
    if (previous === undefined) delete process.env.NEXTPRESS_CLIENT_IP_HEADER
    else process.env.NEXTPRESS_CLIENT_IP_HEADER = previous
  }
})

const manifest = {
  apiVersion: 1,
  id: 'security-fixture',
  name: 'Fixture',
  description: 'Security test fixture',
  version: '1.0.0',
  widgets: [{ id: 'main', name: 'Main', html: 'index.html' }],
}
const files = () => ({
  'plugin.json': strToU8(JSON.stringify(manifest)),
  'index.html': strToU8('<p>Hello</p>'),
})

test('plugin ZIP rejects traversal and decompression bombs', async () => {
  const valid = await readPluginPackage(Buffer.from(zipSync(files())))
  assert.equal(valid.manifest.id, manifest.id)
  for (const name of ['../escape.js', '/escape.js', 'bad.php']) {
    await assert.rejects(
      readPluginPackage(Buffer.from(zipSync({ ...files(), [name]: strToU8('bad') }))),
    )
  }
  await assert.rejects(
    readPluginPackage(
      Buffer.from(zipSync({ ...files(), 'large.js': new Uint8Array(1024 * 1024 + 1) })),
    ),
  )
})

test('plugin frames escape context and cannot connect, submit forms, or share origin', async () => {
  const plugin = await readPluginPackage(Buffer.from(zipSync(files())))
  const html = renderPluginFrame({
    ...plugin,
    config: { settings: {}, placements: [] },
    widgetId: 'main',
    preview: false,
    site: { name: '</script><script>alert(1)</script>', description: '' },
  })
  assert.doesNotMatch(html, /<script>alert\(1\)/)
  assert.match(pluginFrameCsp, /connect-src 'none'/)
  assert.match(pluginFrameCsp, /form-action 'none'/)
  assert.match(pluginFrameCsp, /sandbox allow-scripts/)
  assert.doesNotMatch(pluginFrameCsp, /allow-same-origin/)
})

test('theme CSS cannot inject HTML, external resources, or escape its root', () => {
  for (const css of [
    'body { color: red }',
    ':scope + body { color: red }',
    ':scope { background: url(https://evil.test/x) }',
    '@import "https://evil.test/x";',
    ':scope { content: "</style><script>alert(1)</script>" }',
  ])
    assert.throws(() => scopeThemeCss(css, 'fixture', 'a'.repeat(64), {}))
})
