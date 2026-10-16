import { z } from 'zod'
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka, dan tanda hubung')
export const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => !v || /^https?:\/\//i.test(v) || /^\/api\/media\/[a-f0-9]{32}$/.test(v),
    'URL harus http(s) atau media CMS',
  )
export const postInput = z.object({
  id: z.string().max(32),
  version: z.union([z.iso.datetime({ offset: true }), z.literal('')]).default(''),
  title: z.string().trim().min(1, 'Judul wajib diisi').max(250),
  slug: z.string().trim().max(160).default(''),
  slugMode: z.enum(['auto', 'manual']).default('manual'),
  excerpt: z.string().trim().max(500),
  content: z.string().max(500000),
  featuredImage: safeUrl,
  featuredImageAlt: z.string().trim().max(250),
  status: z.enum(['draft', 'pending', 'published']),
  categories: z.array(z.string().max(32)).max(30),
  tags: z.string().max(1000),
})
const postId = z.string().regex(/^[a-f0-9]{32}$/, 'ID artikel tidak valid')
export const quickPostInput = z.object({
  id: postId,
  title: postInput.shape.title,
  slug: slugSchema,
  status: postInput.shape.status,
  version: z.iso.datetime({ offset: true }),
})
export const bulkPostInput = z.object({
  ids: z
    .array(postId)
    .min(1, 'Pilih artikel terlebih dahulu')
    .max(20, 'Maksimal 20 artikel sekaligus'),
  status: postInput.shape.status,
})
export const reservedPageSlugs = new Set([
  'admin',
  'api',
  'blog',
  'search',
  'archive',
  'author',
  'category',
  'sitemap',
  'robots',
  'feed',
  'bookmarks',
  'preview',
  'icon',
  'opengraph-image',
])
export const pageInput = z
  .object({
    id: z.string().max(32),
    version: z.union([z.iso.datetime({ offset: true }), z.literal('')]).default(''),
    title: z.string().trim().min(1).max(250),
    slug: z.string().trim().max(160).default(''),
    slugMode: z.enum(['auto', 'manual']).default('manual'),
    parentId: z.string().max(32).optional(),
    menuOrder: z
      .string()
      .regex(/^-?\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(-2147483648).max(2147483647))
      .optional(),
    pageTemplate: z
      .string()
      .max(200)
      .regex(/^(?:default|(?:theme|plugin):[a-z0-9-]+:[a-z][a-z0-9-]*)$/)
      .optional(),
    content: z.string().max(500000),
  })
  .superRefine((input, ctx) => {
    if (input.slugMode === 'manual' && reservedPageSlugs.has(input.slug))
      ctx.addIssue({ code: 'custom', path: ['slug'], message: 'Slug ini dipakai rute aplikasi' })
  })
export type ActionState = {
  error?: string
  success?: string
  saved?: {
    id: string
    slug: string
    version: string
    status?: 'draft' | 'pending' | 'published'
  }
}
