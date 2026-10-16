'use client'
// client
import { useActionState } from 'react'
import type { CategoryNode } from '@/lib/core/category-tree'
import { saveTaxonomy } from '@/server/actions/taxonomy'
export function TaxonomyForm({
  kind,
  item,
  categories = [],
}: {
  kind: 'authors' | 'categories'
  categories?: CategoryNode[]
  item?: {
    id: string
    name: string
    slug: string
    description: string
    parentId?: string | null
    verified?: boolean
  }
}) {
  const [state, action, pending] = useActionState(saveTaxonomy.bind(null, kind), {})
  return (
    <form action={action} className="adminForm">
      <input name="id" type="hidden" value={item?.id || ''} />
      <label>
        Nama
        <input name="name" required maxLength={120} defaultValue={item?.name} />
      </label>
      <label>
        Slug
        <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={item?.slug} />
      </label>
      {kind === 'categories' && (
        <label>
          Induk kategori
          <select name="parentId" defaultValue={item?.parentId || ''}>
            <option value="">— Tanpa induk —</option>
            {categories
              .filter((category) => category.id !== item?.id)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {'— '.repeat(category.depth)}
                  {category.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        Deskripsi
        <textarea name="description" defaultValue={item?.description} />
      </label>
      {kind === 'authors' && (
        <label className="adminCheck">
          <input
            type="checkbox"
            name="verified"
            value="true"
            defaultChecked={item?.verified ?? false}
          />
          Penulis terverifikasi
        </label>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      <button className="button" disabled={pending}>
        Simpan {kind === 'authors' ? 'penulis' : 'kategori'}
      </button>
    </form>
  )
}
