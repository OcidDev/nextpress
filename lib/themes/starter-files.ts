import 'server-only'

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { hasDatabase } from '@/lib/db'
import { getDatabaseTransients } from '@/lib/core/options-server'
import { blockCatalog } from '@/lib/blocks/catalog'
import {
  parseTemplate,
  TEMPLATE_SCHEMA_VERSION,
  templateSchema,
  measureTemplate,
  MAX_TEMPLATE_NODES,
  MAX_TEMPLATE_DEPTH,
  type BlockNode,
  type TemplateIssue,
} from './template'

/**
 * Sumber template untuk pratinjau (sprint EXT-03).
 *
 * Sementara ini template dibaca dari tema contoh di `examples/themes/starter`,
 * dengan tata letak yang sama seperti paket tema nanti: `templates/<nama>.json`
 * untuk template halaman dan `parts/<slug>.json` untuk bagian yang disisipkan
 * `core/template-part`. Ini **bukan** tempat tinggal paket tema yang sebenarnya —
 * EXT-05 yang akan memasang paket dari unggahan dan mengganti pembacaan berkas di
 * bawah dengan pembacaan paket.
 *
 * Yang sudah ditegakkan sekarang: pemanggil tidak dapat menunjuk berkas
 * sembarangan. Nama template dan slug part disaring pola yang tidak menerima `/`,
 * `\`, atau `..`, dan jalur akhirnya selalu digabung dari direktori tetap — jadi
 * tidak ada jalur dari permintaan HTTP yang sampai ke `readFile`.
 */

/** Akar tema contoh. Jalur tetap, bukan masukan pengguna. */
export const starterThemeRoot = path.join(process.cwd(), 'examples/themes/starter')

/** Nama template: sama dengan `templateNameSchema`. */
const templateFileSchema =
  /^(?:index|home|front-page|single|page|archive|category|tag|taxonomy|author|date|search|bookmarks|404)(?:-[a-z0-9-]+)?$/
/** Slug part: sama dengan `partSlugSchema` di `lib/blocks/schemas.ts`. */
const partFileSchema = /^[a-z][a-z0-9-]{0,39}$/

/** Isi satu template tema: pohon bloknya, atau daftar masalah yang menghalanginya. */
export type StarterNodes = { nodes?: BlockNode[]; issues: TemplateIssue[] }

// Content edits and catalog/schema-version changes get a different cache key.
// Bump TEMPLATE_SCHEMA_VERSION for validation changes outside the catalog.
// Transients only accelerate this guarded preview.
const schemaHash = createHash('sha256')
  .update(JSON.stringify({ version: TEMPLATE_SCHEMA_VERSION, blocks: blockCatalog() }))
  .digest('hex')

async function readNodes(file: string): Promise<StarterNodes> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return { issues: [{ path: 'file', message: 'berkas template tidak ditemukan' }] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { issues: [{ path: 'file', message: 'berkas template bukan JSON yang sah' }] }
  }
  const transient = hasDatabase() ? getDatabaseTransients() : null
  const key = 'template:' + createHash('sha256').update(schemaHash).update(raw).digest('hex')
  if (transient) {
    try {
      const cached = await transient.getTransient(key)
      if (
        cached &&
        typeof cached === 'object' &&
        !Array.isArray(cached) &&
        Array.isArray(cached.issues)
      ) {
        const issues = z
          .array(z.object({ path: z.string(), message: z.string() }))
          .safeParse(cached.issues)
        if (issues.success && issues.data.length && cached.nodes === undefined)
          return { issues: issues.data }
        if (issues.success && !issues.data.length) {
          // Recheck tree shape/bounds; a corrupted cache must never crash render.
          // Renderer still validates each block's props against its own registry.
          const tree = templateSchema.safeParse({
            schemaVersion: TEMPLATE_SCHEMA_VERSION,
            blocks: cached.nodes,
          })
          if (tree.success) {
            const size = measureTemplate(tree.data)
            if (size.nodes <= MAX_TEMPLATE_NODES && size.depth <= MAX_TEMPLATE_DEPTH)
              return { nodes: tree.data.blocks, issues: [] }
          }
        }
      }
    } catch {
      // A preview remains usable if the disposable cache is unavailable.
      console.warn('[themes] cache validasi template tidak tersedia; validasi langsung.')
    }
  }
  const { template, issues } = parseTemplate(parsed)
  const result: StarterNodes = template ? { nodes: template.blocks, issues: [] } : { issues }
  if (transient) {
    try {
      await transient.setTransient(key, result, 300)
    } catch {
      console.warn('[themes] hasil validasi template tidak dapat dicache; preview tetap tersedia.')
    }
  }
  return result
}

/**
 * Membaca satu template tema contoh.
 *
 * Nama yang tidak sah **tidak** dicoba dibaca, dan hasilnya dibedakan antara
 * "nama tidak sah", "berkas tidak ada", dan "isi tidak lolos validasi" — pratinjau
 * harus dapat memberi tahu admin yang mana yang salah.
 */
export async function readStarterTemplate(name: string): Promise<StarterNodes> {
  if (!templateFileSchema.test(name))
    return { issues: [{ path: 'template', message: `nama template tidak sah: ${name}` }] }
  return readNodes(path.join(starterThemeRoot, 'templates', `${name}.json`))
}

/**
 * Membaca semua part tema contoh sekaligus, dikunci slug.
 *
 * Slug datang dari nama berkas, jadi berkas yang namanya tidak sah (mis.
 * `Header.json`) cukup dilewati tanpa menggagalkan pratinjau. Berkas yang isinya
 * rusak juga dilewati: rujukan part yang tidak dapat diselesaikan sudah ditangani
 * renderer (dirender kosong dan dicatat).
 */
export async function readStarterParts(): Promise<Record<string, BlockNode[]>> {
  const dir = path.join(starterThemeRoot, 'parts')
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return {}
  }
  const parts: Record<string, BlockNode[]> = {}
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const stem = name.slice(0, -'.json'.length)
    if (!partFileSchema.test(stem)) continue
    const { nodes } = await readNodes(path.join(dir, name))
    if (nodes) parts[stem] = nodes
  }
  return parts
}
