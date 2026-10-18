import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportWxr, importWxr } from '../lib/core/tools'
import { parseBloggerXml } from '../lib/core/blogger-importer'

const item = {
  id: 'fixture',
  title: 'Coffee & tea <3',
  slug: 'coffee-tea',
  content: '<p>A &amp; B ]]> C</p>',
  status: 'draft',
  type: 'post',
  date: '2026-10-18T00:00:00Z',
  author: 'A ]]> B',
  tags: ['News & tips'],
}
test('WXR preserves XML entities and CDATA delimiters during export/import', () => {
  const xml = exportWxr([item])
  assert.match(xml, /domain="post_tag"/)
  assert.equal(importWxr(xml).items[0]?.title, item.title)
  assert.equal(importWxr(xml).items[0]?.content, item.content)
  assert.equal(importWxr(xml).items[0]?.status, 'draft')
})
test('WXR excludes attachments and rejects oversized item lists instead of truncating them', () => {
  assert.equal(importWxr(exportWxr([{ ...item, type: 'attachment' }])).totalProcessed, 0)
  assert.throws(
    () => importWxr(exportWxr([item, { ...item, slug: 'second' }]), false, 1),
    /maksimal 1/,
  )
  assert.throws(() => importWxr('<!ENTITY file SYSTEM "file:///etc/passwd">'), /ditolak/)
})
test('Blogger rejects oversized lists before saving any content', () => {
  const entry =
    '<entry><category term="http://schemas.google.com/blogger/2008/kind#post"/><title>Fixture</title><content>body</content></entry>'
  assert.throws(() => parseBloggerXml(`<feed>${entry}${entry}</feed>`, false, 1), /maksimal 1/)
  assert.throws(() => parseBloggerXml('<!ENTITY file SYSTEM "file:///etc/passwd">'), /ditolak/)
})
