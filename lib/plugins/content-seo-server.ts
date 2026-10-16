import 'server-only'
import { cache } from 'react'
import { eq, sql } from 'drizzle-orm'
import { getDb, hasDatabase } from '@/lib/db'
import { plugins } from '@/lib/db/schema'
import { parsePluginConfig, pluginManifestSchema } from './manifest'
import type { ContentSeoProvider, ContentSeoRuntime, ContentSeoSite } from './content-seo'
import type { Post, SEO } from '@/types/post'

// Only trusted, compiled modules execute on the server. Uploaded ZIP JavaScript
// remains sandboxed in widgets; a manifest can only select a runtime registered
// here by id. The registry is intentionally empty: a package declaring
// `extensions.contentSeo` installs and activates, but contributes no panel,
// metadata, or structured data until its runtime is compiled into this build.
const runtimes: Record<string, ContentSeoRuntime> = {}
type Reader = Pick<ReturnType<typeof getDb>, 'select'>

export async function readContentSeoProvider(db: Reader): Promise<ContentSeoProvider | null> {
  const rows = await db
    .select({
      id: plugins.id,
      manifest: plugins.manifest,
      config: plugins.config,
      revision: plugins.revision,
    })
    .from(plugins)
    .where(eq(plugins.enabled, true))
    .orderBy(plugins.id)
  for (const row of rows) {
    const manifest = pluginManifestSchema.safeParse(row.manifest)
    if (!manifest.success || !manifest.data.extensions?.contentSeo) continue
    if (!runtimes[manifest.data.extensions.contentSeo]) continue
    try {
      return {
        id: row.id,
        name: manifest.data.name,
        revision: row.revision,
        runtime: manifest.data.extensions.contentSeo,
        config: parsePluginConfig(manifest.data, row.config),
      }
    } catch {
      /* A broken package cannot take down public metadata. */
    }
  }
  return null
}

export const getContentSeoProvider = cache(async () =>
  hasDatabase() ? readContentSeoProvider(getDb()) : null,
)

export async function effectiveContentSeo(stored: SEO | null | undefined) {
  const provider = await getContentSeoProvider()
  return resolveContentSeo(provider, stored)
}

export async function contentStructuredData(post: Post, site: ContentSeoSite) {
  const provider = await getContentSeoProvider()
  if (!provider) return null
  const runtime = runtimes[provider.runtime]
  return runtime ? runtime.articleSchema(post, provider.config, site) : null
}

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
/** Called before content/media locks, matching plugin activation/configuration. */
export async function lockContentSeo(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
  return readContentSeoProvider(tx)
}

export function saveContentSeo(
  provider: ContentSeoProvider | null,
  data: FormData,
  previous: SEO | null | undefined,
) {
  const submitted = data.get('contentSeoProvider')
  // Editors opened before installation, and editors without this extension,
  // must preserve old SEO. Never interpret missing fields as a request to clear.
  if (submitted === null) return previous ?? null
  const runtime = provider ? runtimes[provider.runtime] : undefined
  if (
    !provider ||
    !runtime ||
    submitted !== provider.id ||
    data.get('contentSeoRevision') !== String(provider.revision)
  )
    throw new Error(
      'Plugin SEO telah berubah. Salin perubahan Anda, lalu muat ulang editor sebelum menyimpan.',
    )
  return runtime.saveSeo(data, previous)
}

export function resolveContentSeo(
  provider: ContentSeoProvider | null,
  stored: SEO | null | undefined,
): SEO {
  if (!provider) return {}
  const runtime = runtimes[provider.runtime]
  return runtime ? runtime.resolveSeo(stored, provider.config) : {}
}
