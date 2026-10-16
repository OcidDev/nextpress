import { z } from 'zod'
import type { PostTypeDefinition } from './post-types'

const definitionSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    hierarchical: z.boolean().default(false),
    public: z.boolean().default(false),
    showInRest: z.boolean().default(false),
    objectTypes: z.array(z.string().min(1).max(20)).min(1).max(30),
  })
  .strict()
  .refine(
    (value) => new Set(value.objectTypes).size === value.objectTypes.length,
    'Jenis objek harus unik.',
  )
export function createTaxonomyRegistry(types: {
  get: (name: string) => PostTypeDefinition | undefined
}) {
  const entries = new Map<string, z.output<typeof definitionSchema> & { name: string }>()
  return {
    register(name: string, definition: z.input<typeof definitionSchema>) {
      z.string()
        .min(1)
        .max(32)
        .regex(/^[a-z][a-z0-9_-]*$/)
        .parse(name)
      if (entries.has(name)) throw new Error('Taksonomi sudah terdaftar.')
      const parsed = definitionSchema.parse(definition)
      if (parsed.objectTypes.some((type) => !types.get(type)))
        throw new Error('Jenis konten taksonomi tidak terdaftar.')
      entries.set(name, { name, ...parsed })
    },
    get: (name: string) => {
      const entry = entries.get(name)
      return entry ? structuredClone(entry) : undefined
    },
    all: () => [...entries.values()].map((entry) => structuredClone(entry)),
  }
}
export type TaxonomyRegistry = ReturnType<typeof createTaxonomyRegistry>
export function registerInitialTaxonomies(registry: TaxonomyRegistry) {
  registry.register('category', {
    label: 'Kategori',
    hierarchical: true,
    public: true,
    showInRest: true,
    objectTypes: ['post'],
  })
  registry.register('post_tag', {
    label: 'Tag',
    public: true,
    showInRest: true,
    objectTypes: ['post'],
  })
  registry.register('nav_menu', { label: 'Menu', objectTypes: ['nav_menu_item'] })
}
