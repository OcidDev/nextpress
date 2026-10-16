import { z } from 'zod'
import { createPostStatusRegistry, registerInitialPostStatuses } from './post-statuses'
import { createPostTypeRegistry, registerInitialPostTypes } from './post-types'
import { createTaxonomyRegistry, registerInitialTaxonomies } from './taxonomies'
import { createMetaRegistry } from './meta'
import { registerInitialMeta } from './meta-definitions'

/** New registry per kernel/request; no mutable type/status state between users. */
export function createCoreRegistry() {
  const types = createPostTypeRegistry()
  const statuses = createPostStatusRegistry()
  registerInitialPostTypes(types)
  registerInitialPostStatuses(statuses)
  const taxonomies = createTaxonomyRegistry(types)
  registerInitialTaxonomies(taxonomies)
  const meta = createMetaRegistry()
  registerInitialMeta(meta)
  return {
    types,
    statuses,
    taxonomies,
    meta,
    registerTaxonomy: taxonomies.register,
    registerMeta: meta.register,
    registerPostType: types.register,
    registerPostStatus: statuses.register,
    validateContent(value: unknown) {
      const parsed = z
        .object({
          id: z.string().min(1).max(32).optional(),
          type: z.string(),
          status: z.string(),
          parentId: z.string().min(1).max(32).nullable().optional(),
          visibility: z.enum(['public', 'private', 'password']).default('public'),
          passwordHash: z.string().min(1).nullable().optional(),
        })
        .strict()
        .parse(value)
      if (!types.get(parsed.type)) throw new Error(`Jenis konten tidak terdaftar: ${parsed.type}`)
      if (!statuses.get(parsed.status)) throw new Error(`Status tidak terdaftar: ${parsed.status}`)
      if (parsed.parentId && parsed.parentId === parsed.id)
        throw new Error('Konten tidak boleh menjadi induk sendiri.')
      if (parsed.visibility === 'password' && !parsed.passwordHash)
        throw new Error('Visibility password memerlukan hash.')
      return parsed
    },
  }
}
export type CoreRegistry = ReturnType<typeof createCoreRegistry>
