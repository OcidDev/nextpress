import { createElement, Fragment, type ReactNode } from 'react'
import type { z } from 'zod'
import { MAX_TEMPLATE_DEPTH, MAX_TEMPLATE_NODES, type BlockNode } from '@/lib/themes/template'
import type { BlockContext } from './context'

/**
 * Kontrak blok dan renderer pohon (sprint EXT-03).
 *
 * Sebuah blok adalah satu unit render yang dapat dipakai template tema: nama
 * (`core/post-title`), skema props (Zod), dan fungsi render. Registry memetakan
 * nama → definisi; renderer menelusuri pohon template dan memanggilnya.
 *
 * Berkas ini murni (tanpa `server-only`), tetapi blok boleh async: di App Router
 * komponen server async adalah jalur normal, dan renderer ini memang dijalankan
 * di server. Renderer **tidak** memvalidasi ulang seluruh template — itu tugas
 * `parseTemplate` sebelum pohon disimpan — melainkan menjadi jaring pengaman
 * terakhir: blok tak dikenal, props cacat, kedalaman berlebih, rujukan part yang
 * tidak ada, atau jumlah node yang melebihi batas tidak menjatuhkan render
 * halaman; node itu dilewati dan dicatat, sisanya tetap tampil.
 */

/** Bantuan yang diterima blok saat render. */
export type BlockHelpers = {
  /** Data request (artikel, arsip, situs). Lihat `context.ts`. */
  context: BlockContext
  /** Hasil render `children`; hanya berisi sesuatu untuk blok kontainer. */
  children: ReactNode
  /** Jalur node di pohon (`blocks.0.children.2`) untuk pesan log yang menunjuk. */
  path: string
  /** Kedalaman node ini; akar pohon adalah 1. */
  depth: number
  /**
   * Merender isi sebuah template part (`core/template-part`).
   *
   * Rujukan yang tidak ada atau melingkar menghasilkan `null` dan dicatat, bukan
   * rekursi tak berujung: paket tema berasal dari unggahan, jadi siklus part
   * adalah hal yang harus ditahan, bukan diasumsikan tidak ada.
   */
  renderPart(slug: string): Promise<ReactNode>
}

/**
 * Definisi satu blok.
 *
 * `props` adalah skema Zod. Renderer memakai skema yang sama untuk memvalidasi
 * props sebelum render, jadi tidak ada jalan bagi blok untuk menerima props yang
 * belum diperiksa.
 */
export type BlockDefinition<P = Record<string, unknown>> = {
  name: string
  props: z.ZodType<P>
  /** Blok kontainer menerima `children`; blok lain mengabaikannya (dicatat). */
  container?: boolean
  /** Merender blok. `null` berarti "tidak ada yang dirender" — itu bukan galat. */
  render(props: P, helpers: BlockHelpers): ReactNode | Promise<ReactNode>
}

/**
 * Mengubah definisi dengan tipe props spesifik menjadi `BlockDefinition` biasa.
 *
 * Registry memang heterogen — ia menyimpan blok yang tipe props-nya berbeda-beda —
 * dan satu-satunya jalan aman ke sana adalah lewat `props.safeParse` di renderer,
 * yang menyerahkan data hasil parse ke `render`. Cast di bawah menyatakan itu
 * sekali, di sini, alih-alih di setiap berkas blok.
 */
export function defineBlock<P>(definition: BlockDefinition<P>): BlockDefinition {
  return definition as unknown as BlockDefinition
}

/** Peta nama → definisi blok. */
export type BlockRegistry = {
  register(definition: BlockDefinition): void
  get(name: string): BlockDefinition | undefined
  has(name: string): boolean
  list(): BlockDefinition[]
  names(): string[]
}

export function createBlockRegistry(definitions: readonly BlockDefinition[] = []): BlockRegistry {
  const blocks = new Map<string, BlockDefinition>()
  const registry: BlockRegistry = {
    register(definition) {
      if (blocks.has(definition.name)) throw new Error(`blok ${definition.name} sudah terdaftar`)
      blocks.set(definition.name, definition)
    },
    get: (name) => blocks.get(name),
    has: (name) => blocks.has(name),
    list: () => [...blocks.values()],
    names: () => [...blocks.keys()],
  }
  for (const definition of definitions) registry.register(definition)
  return registry
}

/** Catatan apa yang terjadi selama satu render pohon. */
export type BlockRenderReport = {
  /** Nama blok yang dirender, dalam urutan post-order (anak sebelum induknya). */
  rendered: string[]
  /** Blok yang tidak ada di registry — dilewati, halaman tetap dirender. */
  unknown: string[]
  /** Blok yang props-nya tidak lolos skema — dilewati, halaman tetap dirender. */
  invalid: string[]
  /** Node yang tidak dirender karena batas kedalaman/jumlah node. */
  truncated: string[]
  /** Slug template part yang berhasil disisipkan. */
  parts: string[]
  /** Rujukan yang tidak dapat diselesaikan: part tidak ada atau siklus part. */
  unresolved: string[]
  /** Jumlah node yang benar-benar dirender. */
  nodes: number
}

type RenderState = {
  context: BlockContext
  registry: BlockRegistry
  parts?: Record<string, readonly BlockNode[]>
  /** Part yang sedang dirender; mendeteksi siklus `a → b → a`. */
  activeParts: Set<string>
  budget: { left: number }
  report: BlockRenderReport
}

function log(message: string, detail?: unknown) {
  console.error(`[blocks] ${message}`, detail ?? '')
}

/**
 * Merender pohon blok menjadi ReactNode.
 *
 * Batas yang ditegakkan di sini sama dengan batas `parseTemplate` (kedalaman dan
 * jumlah node), ditambah satu batas yang hanya bisa dilihat saat render: siklus
 * `template-part`. Pohon yang datang dari database sudah pernah divalidasi, jadi
 * batas ini hanya menghalangi pohon yang lolos validasi lama atau ditulis langsung
 * ke database; melewatinya berarti melewati sisa pohon, bukan menggagalkan render.
 *
 * `parts` berisi isi template part yang dirujuk `core/template-part`. Memetakan
 * slug → pohon diserahkan pemanggil (di aplikasi: resolver paket tema, EXT-05)
 * supaya berkas ini tetap murni dan dapat diuji tanpa paket tema.
 *
 * Batas kedalaman dan jumlah node tidak dapat diatur pemanggil: keduanya sama
 * dengan batas `parseTemplate`, dan opsi yang diterima lalu tidak dipakai lebih
 * buruk daripada tidak ada — pemanggil akan mengira ia mengubah sesuatu.
 */
export async function renderBlockTree(
  nodes: readonly BlockNode[],
  options: {
    context: BlockContext
    registry: BlockRegistry
    parts?: Record<string, readonly BlockNode[]>
  },
): Promise<{ content: ReactNode; report: BlockRenderReport }> {
  const state: RenderState = {
    context: options.context,
    registry: options.registry,
    parts: options.parts,
    activeParts: new Set(),
    budget: { left: MAX_TEMPLATE_NODES },
    report: {
      rendered: [],
      unknown: [],
      invalid: [],
      truncated: [],
      parts: [],
      unresolved: [],
      nodes: 0,
    },
  }
  const content = await renderNodes(nodes, state, 1, 'blocks.')
  return { content, report: state.report }
}

async function renderNodes(
  nodes: readonly BlockNode[],
  state: RenderState,
  depth: number,
  trail: string,
): Promise<ReactNode[]> {
  const rendered: ReactNode[] = []
  for (const [index, node] of nodes.entries()) {
    const path = `${trail}${index}`
    if (state.budget.left <= 0) {
      state.report.truncated.push(path)
      log(`anggaran node habis; ${path} dan sisanya tidak dirender`)
      break
    }
    state.budget.left -= 1
    state.report.nodes += 1
    // Setiap node dibungkus Fragment berkunci: daftar anak memang sebuah array,
    // dan tanpa kunci React memperingatkan setiap kali pohon dirender. Fragment
    // tidak menghasilkan markup, jadi hasil HTML-nya tidak berubah.
    rendered.push(
      createElement(Fragment, { key: path }, await renderNode(node, state, depth, path)),
    )
  }
  return rendered
}

/** Menyisipkan isi template part; dipakai `core/template-part` lewat `helpers`. */
async function renderPart(slug: string, depth: number, state: RenderState): Promise<ReactNode> {
  const nodes = state.parts?.[slug]
  if (!nodes) {
    state.report.unresolved.push(slug)
    log(`template part tidak ditemukan: ${slug}`)
    return null
  }
  if (state.activeParts.has(slug)) {
    state.report.unresolved.push(`${slug} (siklus)`)
    log(`siklus template part dihentikan: ${slug}`)
    return null
  }
  if (depth >= MAX_TEMPLATE_DEPTH) {
    state.report.truncated.push(`part:${slug}`)
    log(`kedalaman melebihi ${MAX_TEMPLATE_DEPTH}; part ${slug} tidak dirender`)
    return null
  }
  state.activeParts.add(slug)
  try {
    const content = await renderNodes(nodes, state, depth + 1, `part:${slug}.`)
    state.report.parts.push(slug)
    return content
  } finally {
    state.activeParts.delete(slug)
  }
}

async function renderNode(
  node: BlockNode,
  state: RenderState,
  depth: number,
  path: string,
): Promise<ReactNode> {
  const definition = state.registry.get(node.block)
  if (!definition) {
    // Blok tak dikenal dirender kosong dan dicatat: satu blok yang hilang (mis.
    // plugin dinonaktifkan) tidak boleh menjatuhkan seluruh halaman.
    state.report.unknown.push(node.block)
    log(`blok tidak dikenal dilewati: ${node.block}`, path)
    return null
  }

  const props = definition.props.safeParse(node.props ?? {})
  if (!props.success) {
    state.report.invalid.push(node.block)
    log(
      `props cacat dilewati: ${node.block}`,
      props.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    )
    return null
  }

  let children: ReactNode = null
  if (node.children) {
    if (!definition.container) {
      log(`children pada blok non-kontainer diabaikan: ${node.block}`, path)
    } else if (depth >= MAX_TEMPLATE_DEPTH) {
      state.report.truncated.push(`${path}.children`)
      log(`kedalaman melebihi ${MAX_TEMPLATE_DEPTH}; ${path}.children tidak dirender`)
    } else {
      children = await renderNodes(node.children, state, depth + 1, `${path}.children.`)
    }
  }

  state.report.rendered.push(node.block)
  return await definition.render(props.data as never, {
    context: state.context,
    children,
    path,
    depth,
    renderPart: (slug) => renderPart(slug, depth, state),
  })
}
