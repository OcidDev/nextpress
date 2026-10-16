import { z } from 'zod'
import type { MetaRegistry } from './meta'

/** Public fields are explicit opt-ins. Migration provenance stays internal. */
export function registerInitialMeta(registry: MetaRegistry) {
  registry.register('content', 'seo_title', { schema: z.string().max(250), showInRest: true })
  registry.register('content', 'seo_description', { schema: z.string().max(500), showInRest: true })
  registry.register('content', '_legacy_fields', { schema: z.record(z.string(), z.json()) })
  registry.register('content', '_legacy_counters', {
    schema: z
      .object({
        view_count: z.number().int().nonnegative(),
        comment_count: z.number().int().nonnegative(),
      })
      .strict(),
  })
  registry.register('content', '_media_blob_id', { schema: z.string().min(1).max(2000) })
  registry.register('term', '_legacy_tag', { schema: z.string().max(1000) })
  registry.register('user', '_editor_preferences', { schema: z.record(z.string(), z.json()) })
  registry.register('comment', '_moderation_note', { schema: z.string().max(5000) })
}
