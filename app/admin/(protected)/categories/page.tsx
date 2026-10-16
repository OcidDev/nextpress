import Link from 'next/link'
import { listTaxonomy, listCategoryTree } from '@/lib/db/queries/taxonomy'
import { TaxonomyForm } from '@/components/admin/TaxonomyForm'
import { DeleteForm } from '@/components/admin/DeleteForm'
import { deleteTaxonomy } from '@/server/actions/taxonomy'
import { SortableHeader } from '@/components/admin/SortableHeader'

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; saved?: string; sort?: string; dir?: string }>
}) {
  const params = await searchParams
  const result = await listTaxonomy('categories', params)
  const rows = result.rows
  const tree = await listCategoryTree()
  const item = rows.find((r) => r.id === params.edit)
  return (
    <>
      <h1>Kategori</h1>
      {params.saved && <p role="status">Data tersimpan.</p>}
      <div className="tableWrap">
        <table className="adminTable">
          <thead>
            <tr>
              <SortableHeader
                column="name"
                label="Nama"
                basePath="/admin/categories"
                params={params}
                currentSort={result.sort}
                currentDir={result.dir}
                defaultDir="asc"
              />
              <SortableHeader
                column="slug"
                label="Slug"
                basePath="/admin/categories"
                params={params}
                currentSort={result.sort}
                currentDir={result.dir}
                defaultDir="asc"
              />
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>/{r.slug}</td>
                <td>
                  <div className="adminRowActions">
                    <Link href={`/admin/categories?edit=${r.id}`}>Edit</Link>
                    <DeleteForm id={r.id} action={deleteTaxonomy.bind(null, 'categories')} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>{item ? 'Edit' : 'Tambah'} kategori</h2>
      <TaxonomyForm key={item?.id || 'new'} kind="categories" item={item} categories={tree} />
    </>
  )
}
