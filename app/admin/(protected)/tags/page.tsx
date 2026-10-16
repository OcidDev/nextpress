import Link from 'next/link'
import { listedTags, type ListSearch } from '@/lib/db/queries/admin-list'
import { ListFilters } from '@/components/admin/ListFilters'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { TagForm } from '@/components/admin/TagForm'
import { DeleteForm } from '@/components/admin/DeleteForm'
import { deleteTag } from '@/server/actions/tags'
import { SortableHeader } from '@/components/admin/SortableHeader'

export default async function Tags({ searchParams }: { searchParams: Promise<ListSearch> }) {
  const search = await searchParams
  const result = await listedTags(search)
  return (
    <>
      <h1>Tag</h1>
      {search.saved && <p role="status">Tag tersimpan.</p>}
      <p>
        Tag dibuat saat ditambahkan ke artikel. Mengganti nama menerapkannya ke semua artikel; nama
        yang sama akan digabung.
      </p>
      <ListFilters basePath="/admin/tags" params={result.params} label="Tag" />
      <div className="tableWrap">
        <table className="adminTable">
          <thead>
            <tr>
              <SortableHeader
                column="name"
                label="Nama"
                basePath="/admin/tags"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="asc"
              />
              <SortableHeader
                column="count"
                label="Artikel"
                basePath="/admin/tags"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="desc"
              />
              <th>Ubah nama</th>
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((tag) => (
              <tr key={tag.name}>
                <td>{tag.name}</td>
                <td>
                  <Link href={`/admin/posts?tag=${encodeURIComponent(tag.name)}`}>
                    {tag.count} artikel
                  </Link>
                </td>
                <td>
                  <TagForm name={tag.name} />
                </td>
                <td>
                  <DeleteForm id={tag.name} action={deleteTag} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.rows.length && (
        <p>{result.params.q ? 'Tidak ada tag yang sesuai dengan filter.' : 'Belum ada tag.'}</p>
      )}
      <AdminPagination basePath="/admin/tags" {...result} />
    </>
  )
}
