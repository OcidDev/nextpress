// Only loaded by Playwright's test-server NODE_OPTIONS. Production application
// code has no fixture URL, unsigned-manifest switch, or alternative trust source.
import { readFile } from 'node:fs/promises'
const fixture = process.env.TEST_RELEASE_FIXTURE
if (!fixture) throw new Error('TEST_RELEASE_FIXTURE is required for this test preload')
const original = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input)
  if (
    url.startsWith('https://api.github.com/repos/nextpress-test/release-fixture/') ||
    url.startsWith('https://github.com/nextpress-test/release-fixture/releases/download/')
  ) {
    const state = JSON.parse(await readFile(fixture, 'utf8').catch(() => '{}'))
    if (!state.manifest) return Response.json({ message: 'No fixture release' }, { status: 404 })
    const manifest = state.manifest
    if (url.endsWith('/nextpress-release.json')) return Response.json(manifest)
    return Response.json({
      tag_name: manifest.tag,
      draft: false,
      prerelease: false,
      assets: [
        {
          name: 'nextpress-release.json',
          browser_download_url: `https://github.com/nextpress-test/release-fixture/releases/download/${manifest.tag}/nextpress-release.json`,
        },
        {
          name: `nextpress-${manifest.version}.tar.gz`,
          browser_download_url: manifest.source.archive,
        },
      ],
    })
  }
  return original(input, init)
}
