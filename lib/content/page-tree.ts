export type PageTreeItem = { id: string; title: string; parentId: string | null; menuOrder: number }

export function validatePageParent(rows: PageTreeItem[], id: string, parentId: string | null) {
  const map = new Map(rows.map((row) => [row.id, row]))
  const seen = new Set([id])
  let parent = parentId
  while (parent) {
    if (seen.has(parent))
      throw new Error('Induk laman tidak boleh menunjuk dirinya sendiri atau turunannya.')
    if (seen.size >= 64) throw new Error('Hierarki laman terlalu dalam (maksimal 64 tingkat).')
    seen.add(parent)
    const row = map.get(parent)
    if (!row) throw new Error('Induk laman tidak ditemukan. Pilih induk lain.')
    parent = row.parentId
  }
}

export function pageParentChoices(rows: PageTreeItem[], excludeId?: string) {
  const children = new Map<string | null, PageTreeItem[]>()
  const ids = new Set(rows.map((row) => row.id))
  for (const row of [...rows].sort(
    (a, b) =>
      a.menuOrder - b.menuOrder || a.title.localeCompare(b.title, 'id') || a.id.localeCompare(b.id),
  )) {
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), row])
  }
  const result: (PageTreeItem & { depth: number })[] = []
  const seen = new Set<string>()
  function walk(parent: string | null, depth: number) {
    if (depth >= 64) return
    for (const row of children.get(parent) ?? []) {
      if (row.id === excludeId || seen.has(row.id)) continue
      seen.add(row.id)
      result.push({ ...row, depth })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}
