import { z } from 'zod'
import { registryNameSchema } from './post-statuses'

export const postSupports = [
  'title',
  'editor',
  'thumbnail',
  'excerpt',
  'comments',
  'revisions',
  'custom-fields',
  'page-attributes',
] as const
const typeSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    singularLabel: z.string().trim().min(1).max(100),
    public: z.boolean().default(false),
    hierarchical: z.boolean().default(false),
    showInRest: z.boolean().default(false),
    restBase: z
      .string()
      .max(60)
      .regex(/^[a-z][a-z0-9-]*$/)
      .optional(),
    rewrite: z
      .string()
      .max(80)
      .regex(/^[a-z][a-z0-9-]*$/)
      .optional(),
    capabilityType: registryNameSchema.default('post'),
    supports: z.array(z.enum(postSupports)).max(postSupports.length).default([]),
  })
  .strict()
  .refine((value) => new Set(value.supports).size === value.supports.length, 'Supports harus unik.')
export type PostTypeDefinition = z.output<typeof typeSchema> & { name: string }

export function createPostTypeRegistry() {
  const entries = new Map<string, PostTypeDefinition>()
  return {
    register(name: string, definition: z.input<typeof typeSchema>) {
      registryNameSchema.parse(name)
      if (entries.has(name)) throw new Error(`Jenis konten sudah terdaftar: ${name}`)
      const parsed = typeSchema.parse(definition)
      if (parsed.restBase && !parsed.showInRest) throw new Error('restBase memerlukan showInRest.')
      if (
        parsed.restBase &&
        [...entries.values()].some((entry) => entry.restBase === parsed.restBase)
      )
        throw new Error(`REST base sudah terdaftar: ${parsed.restBase}`)
      entries.set(name, { name, ...parsed })
    },
    get: (name: string) => {
      const entry = entries.get(name)
      return entry ? structuredClone(entry) : undefined
    },
    all: () => [...entries.values()].map((entry) => structuredClone(entry)),
  }
}

export function registerInitialPostTypes(registry: ReturnType<typeof createPostTypeRegistry>) {
  registry.register('post', {
    label: 'Artikel',
    singularLabel: 'Artikel',
    public: true,
    showInRest: true,
    restBase: 'posts',
    rewrite: 'blog',
    supports: ['title', 'editor', 'thumbnail', 'excerpt', 'comments', 'revisions', 'custom-fields'],
  })
  registry.register('page', {
    label: 'Halaman',
    singularLabel: 'Halaman',
    public: true,
    hierarchical: true,
    showInRest: true,
    restBase: 'pages',
    capabilityType: 'page',
    supports: [
      'title',
      'editor',
      'thumbnail',
      'comments',
      'revisions',
      'page-attributes',
      'custom-fields',
    ],
  })
  registry.register('attachment', {
    label: 'Media',
    singularLabel: 'Lampiran',
    showInRest: true,
    restBase: 'media',
    supports: ['title', 'editor', 'custom-fields'],
  })
  for (const [name, label] of Object.entries({
    revision: 'Revisi',
    nav_menu_item: 'Item menu',
    wp_navigation: 'Navigasi',
    wp_block: 'Pola',
    wp_template: 'Template',
    wp_template_part: 'Bagian template',
    wp_global_styles: 'Gaya global',
    user_request: 'Permintaan pengguna',
  })) {
    registry.register(name, {
      label,
      singularLabel: label,
      hierarchical: name === 'nav_menu_item',
      supports: ['title', 'editor'],
      capabilityType: [
        'wp_template',
        'wp_template_part',
        'wp_global_styles',
        'wp_navigation',
        'nav_menu_item',
      ].includes(name)
        ? 'theme'
        : name === 'user_request'
          ? 'privacy'
          : 'post',
    })
  }
}
