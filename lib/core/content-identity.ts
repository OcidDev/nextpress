import { createHash } from 'node:crypto'

// Keep these namespaces and JSON encoding stable: existing shadow mappings use them.
export const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const stableId = (namespace: string, id: string) => sha([namespace, id]).slice(0, 32)
export const categoryTaxId = (id: string) => stableId('category-taxonomy', id)
export const tagId = (tag: string) => stableId('post-tag-term', tag)
export const tagTaxId = (tag: string) => stableId('post-tag-taxonomy', tag)
export const legacyMetaId = (id: string) => stableId('legacy-meta', id)
