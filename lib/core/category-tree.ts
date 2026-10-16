export const DEFAULT_CATEGORY_ID = 'c0de7a0000000000000000756e636174'
export const DEFAULT_CATEGORY_SLUG = 'uncategorized'
export const DEFAULT_CATEGORY_NAME = 'Tanpa Kategori'
export const MAX_CATEGORY_DEPTH = 64

export type CategoryNode = {
  id: string
  name: string
  slug: string
  parentId: string | null
  depth: number
}

/**
 * Daftar kategori berurut hierarkis dengan kedalaman, untuk dropdown Pengaturan
 * dan pemilih kategori editor. Node dengan induk hilang diperlakukan sebagai akar
 * agar kategori tidak pernah tersembunyi dari UI.
 */
export function buildCategoryTree(
  rows: ReadonlyArray<{ id: string; name: string; slug: string; parentId: string | null }>,
): CategoryNode[] {
  const byParent = new Map<string | null, (typeof rows)[number][]>()
  const ids = new Set(rows.map((row) => row.id))
  for (const row of rows) {
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null
    const bucket = byParent.get(parent)
    if (bucket) bucket.push(row)
    else byParent.set(parent, [row])
  }
  for (const bucket of byParent.values())
    bucket.sort((a, b) => a.name.localeCompare(b.name, 'id') || a.id.localeCompare(b.id))

  const out: CategoryNode[] = []
  const seen = new Set<string>()
  const walk = (parent: string | null, depth: number) => {
    if (depth > MAX_CATEGORY_DEPTH) return
    for (const row of byParent.get(parent) || []) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      out.push({ id: row.id, name: row.name, slug: row.slug, parentId: parent, depth })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  // Sisa node hanya mungkin muncul bila data membentuk siklus; tampilkan sebagai akar.
  for (const row of rows)
    if (!seen.has(row.id))
      out.push({ id: row.id, name: row.name, slug: row.slug, parentId: null, depth: 0 })
  return out
}
