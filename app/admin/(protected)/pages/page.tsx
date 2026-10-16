import Link from 'next/link'
import { listedPages, type ListSearch } from '@/lib/db/queries/admin-list'
import { ListFilters } from '@/components/admin/ListFilters'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { DeleteForm } from '@/components/admin/DeleteForm'
import { deletePage } from '@/server/actions/content'
import { formatDate } from '@/lib/utils'
import { SortableHeader } from '@/components/admin/SortableHeader'

export default async function Pages({ searchParams }: { searchParams: Promise<ListSearch> }) {
  const search = await searchParams
  const result = await listedPages(search)
  return (
    <>
      <div className="adminPageHeading">
        <h1>Halaman</h1>
        <Link className="button" href="/admin/pages/new">
          Buat halaman
        </Link>
      </div>
      <ListFilters basePath="/admin/pages" params={result.params} label="Halaman" />
      <div className="tableWrap">
        <table className="adminTable">
          <thead>
            <tr>
              <SortableHeader
                column="title"
                label="Judul"
                basePath="/admin/pages"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="asc"
              />
              <SortableHeader
                column="menuOrder"
                label="Urutan"
                basePath="/admin/pages"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="asc"
              />
              <SortableHeader
                column="updatedAt"
                label="Diperbarui"
                basePath="/admin/pages"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="desc"
              />
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/admin/pages/${item.id}`}>{item.title}</Link>
                  <small className="adminListSecondary">/{item.slug}</small>
                  {item.parentTitle && (
                    <small className="adminListSecondary">Induk: {item.parentTitle}</small>
                  )}
                </td>
                <td>{item.menuOrder}</td>
                <td>{formatDate(item.updatedAt.toISOString())}</td>
                <td>
                  <div className="adminRowActions">
                    <Link href={`/admin/pages/${item.id}`}>Edit</Link>
                    <Link href={`/${item.slug}`}>Lihat</Link>
                    <DeleteForm id={item.id} action={deletePage} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.rows.length && (
        <p>
          {result.params.q ? 'Tidak ada halaman yang sesuai dengan filter.' : 'Belum ada halaman.'}
        </p>
      )}
      <AdminPagination basePath="/admin/pages" {...result} />
    </>
  )
}
