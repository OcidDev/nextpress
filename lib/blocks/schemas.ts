import { z } from 'zod'

/**
 * Skema props blok core (sprint EXT-03).
 *
 * Berkas ini adalah **sumber tunggal** untuk dua pemakai:
 *
 * - `lib/themes/template.ts` memakainya untuk memvalidasi pohon template tema
 *   sebelum satu byte pun dirender (draf EXT-00, sekarang memakai peta lengkap).
 * - `lib/blocks/registry.ts` memakainya untuk memvalidasi props saat render dan
 *   untuk mengekspor katalog JSON yang dipakai validator paket tema (EXT-04) dan
 *   dokumentasi.
 *
 * Berkas ini murni: hanya `zod`, tanpa React, tanpa database, tanpa `server-only`.
 *
 * Aturan penulisan skema:
 *
 * - `.strict()` **wajib**: salah ketik nama props harus ditolak, bukan diam-diam
 *   diabaikan (itu yang membuat template rusak lebih sulit didiagnosis).
 * - Setiap nilai punya batas atas. Template berasal dari paket yang diunggah, jadi
 *   props adalah permukaan serangan: `core/paragraph` dibatasi 2000 karakter,
 *   `core/post-list` maksimal 50 item, dan `include`/`siblings` dibatasi jumlahnya.
 * - Tanpa `default()`: nilai yang tidak diberikan diselesaikan oleh komponen render
 *   (satu tempat keputusan), bukan oleh skema.
 * - Tanpa props yang tidak dipakai. Setiap props di sini punya jalur nyata ke
 *   komponen render — props yang diterima lalu diabaikan lebih buruk daripada
 *   tidak ada, karena penulis tema mengira ia mengubah sesuatu.
 */

const slotSchema = z.enum(['home-top', 'home-bottom', 'article-after', 'footer'])
const partSlugSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9-]*$/)
/**
 * Tingkat judul 1–6. Ditulis sebagai literal, bukan `z.number().int().min(1).max(6)`,
 * supaya tipe yang sampai ke komponen render benar-benar `1|2|3|4|5|6` dan bukan
 * `number` — komponen judul hanya boleh dioper tingkat yang ada elemen HTML-nya.
 */
const levelSchema = z.literal([1, 2, 3, 4, 5, 6])

export const blockPropsSchemas = {
  'core/site-header': z.object({ layout: z.enum(['standard', 'compact']).optional() }).strict(),
  'core/site-footer': z.object({ layout: z.enum(['standard', 'compact']).optional() }).strict(),
  'core/route-content': z.object({}).strict(),
  'core/home-sections': z.object({}).strict(),
  'core/mobile-navigation': z.object({}).strict(),
  'core/site-description': z.object({}).strict(),
  'core/content-layout': z
    .object({ layout: z.enum(['standard', 'plain']).optional(), sidebar: z.boolean().optional() })
    .strict(),
  'core/group': z
    .object({
      tagName: z
        .enum(['div', 'main', 'section', 'aside', 'article', 'header', 'footer'])
        .optional(),
      /**
       * `constrained` memakai kelas `themeSection` yang sudah ada (jarak antarbagian
       * bawaan tema); `default` hanya elemen pembungkus tanpa kelas. Tidak ada opsi
       * "wide" karena kelas semacam itu belum ada di tema, jadi props itu akan
       * diterima lalu diabaikan — persis yang ingin dihindari daftar ini.
       */
      layout: z.enum(['default', 'constrained']).optional(),
      className: z.string().max(80).optional(),
    })
    .strict(),
  'core/columns': z.object({ columns: z.number().int().min(1).max(4).optional() }).strict(),
  'core/template-part': z.object({ slug: partSlugSchema }).strict(),
  'core/site-logo': z.object({}).strict(),
  'core/site-title': z.object({ level: levelSchema.optional() }).strict(),
  'core/navigation': z.object({ label: z.string().max(80).optional() }).strict(),
  'core/search': z.object({ label: z.string().max(80).optional() }).strict(),
  'core/theme-toggle': z.object({}).strict(),
  'core/post-list': z
    .object({
      limit: z.number().int().min(1).max(50).optional(),
      layout: z.enum(['grid', 'list']).optional(),
    })
    .strict(),
  'core/post-title': z.object({ level: levelSchema.optional() }).strict(),
  'core/post-meta': z
    .object({
      showAuthor: z.boolean().optional(),
      showDate: z.boolean().optional(),
    })
    .strict(),
  'core/post-featured-image': z
    .object({ aspectRatio: z.enum(['16/9', '3/2', '4/3', '1/1', 'original']).optional() })
    .strict(),
  'core/post-content': z.object({}).strict(),
  'core/post-toc': z
    .object({ open: z.boolean().optional(), title: z.string().max(60).optional() })
    .strict(),
  'core/post-author': z.object({ showBio: z.boolean().optional() }).strict(),
  'core/post-share': z.object({}).strict(),
  'core/related-posts': z.object({ limit: z.number().int().min(1).max(12).optional() }).strict(),
  'core/comments': z.object({}).strict(),
  'core/pagination': z.object({}).strict(),
  'core/widget-area': z.object({ slot: slotSchema }).strict(),
  'core/plugin-widget': z
    .object({ pluginId: z.string().max(64), widgetId: z.string().max(40) })
    .strict(),
  'core/heading': z.object({ level: levelSchema.optional(), text: z.string().max(200) }).strict(),
  'core/paragraph': z.object({ text: z.string().max(2000) }).strict(),
  'core/spacer': z.object({ size: z.enum(['sm', 'md', 'lg']).optional() }).strict(),
} as const

/** Nama blok core yang dikenali build ini. */
export type BlockName = keyof typeof blockPropsSchemas

export const coreBlockNames = Object.keys(blockPropsSchemas) as BlockName[]

/**
 * Blok yang menyimpan anak di dalam `children`. Blok di luar daftar ini menolak
 * `children` (ditegakkan `parseTemplate` dan renderer) supaya pohon tidak memuat
 * node yang tidak akan pernah dirender.
 */
export const containerBlocks: readonly string[] = [
  'core/group',
  'core/columns',
  'core/content-layout',
]
