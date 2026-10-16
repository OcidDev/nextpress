import { z } from 'zod'
import { blockPropsSchemas, containerBlocks, coreBlockNames } from '@/lib/blocks/schemas'

/**
 * Skema template JSON yang dipakai validator dan renderer paket tema.
 *
 * Sebuah template adalah pohon blok JSON, bukan HTML beranotasi seperti tema
 * blok WordPress (`<!-- wp:group -->`). Pohon JSON dapat divalidasi Zod
 * sebelum satu byte pun dirender, tidak butuh parser HTML yang toleran, dan
 * memetakan langsung ke komponen React yang sudah ada di repo ini.
 *
 * Berkas ini menegakkan bentuk pohon, batas ukuran, dan props per blok
 * (skemanya dari `lib/blocks/schemas.ts`, dipakai juga registry EXT-03). Validasi
 * silang antarberkas menjadi tanggung jawab validator paket dan resolver
 * runtime, yang memiliki konteks bagian tema serta plugin terpasang.
 */

export const TEMPLATE_SCHEMA_VERSION = 1

/** Batas pohon, dipilih agar satu template tidak dapat menghabiskan memori render. */
export const MAX_TEMPLATE_NODES = 300
export const MAX_TEMPLATE_DEPTH = 8
export const MAX_BLOCK_CHILDREN = 60
export const MAX_BLOCK_PROPS_BYTES = 2048

/** TextEncoder, bukan Buffer, agar modul tetap aman dipakai di luar Node. */
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

/** Nama blok: `core/*` dari CMS, `plugin/<pluginId>/<blockId>` dari plugin. */
export const blockNameSchema = z
  .string()
  .max(80)
  .regex(/^(?:core\/[a-z][a-z0-9-]*|plugin\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z][a-z0-9-]*)$/)

export const templateNameSchema = z
  .string()
  .max(80)
  .regex(/^(?:index|home|front-page|single|singular|page|archive|category|tag|taxonomy|author|date|search|bookmarks|404)(?:-[a-z0-9-]+)?$/)

/**
 * Nama blok yang dikenali build ini. Sejak EXT-03 peta skema props tidak lagi
 * tinggal di berkas ini melainkan di `lib/blocks/schemas.ts`, sumber tunggal yang
 * dipakai juga oleh registry blok saat merender. Berkas ini tetap pemilik
 * validasi **bentuk pohon** (kedalaman, jumlah node, ukuran props).
 */
export { blockPropsSchemas, coreBlockNames }

export type BlockNode = {
  block: string
  props?: Record<string, unknown>
  children?: BlockNode[]
}

/**
 * Props divalidasi sebagai `unknown` lebih dulu karena skema per blok baru
 * dipilih setelah nama blok diketahui.
 */
const blockNodeSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z
    .object({
      block: blockNameSchema,
      props: z
        .record(z.string().max(40), z.unknown())
        .refine((value) => byteLength(value) <= MAX_BLOCK_PROPS_BYTES, {
          message: `props blok melebihi ${MAX_BLOCK_PROPS_BYTES} byte`,
        })
        .optional(),
      children: z.array(blockNodeSchema).min(1).max(MAX_BLOCK_CHILDREN).optional(),
    })
    .strict(),
)

export const templateSchema = z
  .object({
    schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
    blocks: z.array(blockNodeSchema).min(1).max(MAX_BLOCK_CHILDREN),
  })
  .strict()

export type ThemeTemplate = z.infer<typeof templateSchema>

export type TemplateIssue = { path: string; message: string }

/** Menghitung node, kedalaman, dan ukuran pohon sekali jalan. */
export function measureTemplate(template: ThemeTemplate) {
  let nodes = 0
  let depth = 0
  const walk = (items: BlockNode[], level: number) => {
    depth = Math.max(depth, level)
    for (const item of items) {
      nodes += 1
      if (item.children) walk(item.children, level + 1)
    }
  }
  walk(template.blocks, 1)
  return { nodes, depth, bytes: byteLength(template) }
}

/**
 * Memvalidasi bentuk pohon, batas ukuran, dan props per blok. Blok yang tidak
 * terdaftar ditolak, dan `children` pada blok non-kontainer juga ditolak: anak
 * yatim tidak akan pernah dirender, jadi lebih baik gagal saat validasi daripada
 * tampak seperti template yang berisi sesuatu.
 */
export function parseTemplate(input: unknown): { template?: ThemeTemplate; issues: TemplateIssue[] } {
  const parsed = templateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(akar)',
        message: issue.message,
      })),
    }
  }

  const template = parsed.data
  const { nodes, depth } = measureTemplate(template)
  const issues: TemplateIssue[] = []
  if (nodes > MAX_TEMPLATE_NODES) {
    issues.push({ path: 'blocks', message: `pohon berisi ${nodes} node, batas ${MAX_TEMPLATE_NODES}` })
  }
  if (depth > MAX_TEMPLATE_DEPTH) {
    issues.push({ path: 'blocks', message: `kedalaman ${depth}, batas ${MAX_TEMPLATE_DEPTH}` })
  }

  const walk = (items: BlockNode[], trail: string) => {
    items.forEach((item, index) => {
      const path = `${trail}${index}`
      const schema = (blockPropsSchemas as Record<string, z.ZodType>)[item.block]
      if (!schema) {
        issues.push({ path, message: `blok tidak dikenal: ${item.block}` })
      } else {
        const props = schema.safeParse(item.props ?? {})
        if (!props.success) {
          for (const issue of props.error.issues) {
            // `unrecognized_keys` (dari `.strict()`) tidak membawa jalur, jadi
            // nama kuncinya ditempelkan ke jalur agar pesannya menunjuk ke props
            // yang salah ketik, bukan ke objek props secara umum.
            const unrecognized =
              issue.code === 'unrecognized_keys' ? (issue.keys ?? []).join('|') : ''
            const suffix = [issue.path.join('.'), unrecognized].filter(Boolean).join('.')
            issues.push({ path: `${path}.props${suffix ? `.${suffix}` : ''}`, message: issue.message })
          }
        }
      }
      if (item.children) {
        if (!containerBlocks.includes(item.block))
          issues.push({
            path: `${path}.children`,
            message: `blok ${item.block} tidak menerima children`,
          })
        walk(item.children, `${path}.children.`)
      }
    })
  }
  walk(template.blocks, 'blocks.')

  return issues.length ? { issues } : { template, issues }
}
