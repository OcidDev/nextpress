import Link from 'next/link'
import { listedPages, type ListSearch } from '@/lib/db/queries/admin-list'
import { ListFilters } from '@/components/admin/ListFilters'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { TrashActions } from '@/components/admin/TrashActions'
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
      <nav className="adminStatusTabs" aria-label="Status halaman">
        <Link href="/admin/pages" aria-current={!result.params.status ? 'page' : undefined}>
          Semua
        </Link>
        {[
          ['draft', 'Draft'],
          ['published', 'Terbit'],
          ['trash', 'Sampah'],
        ].map(([status, label]) => (
          <Link
            key={status}
            href={`/admin/pages?status=${status}`}
            aria-current={result.params.status === status ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ListFilters
        basePath="/admin/pages"
        params={result.params}
        label="Halaman"
        statuses={[
          { value: 'draft', label: 'Draft' },
          { value: 'published', label: 'Terbit' },
          { value: 'trash', label: 'Sampah' },
        ]}
      />
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
                  {item.status === 'trash' ? (
                    item.title
                  ) : (
                    <Link href={`/admin/pages/${item.id}`}>{item.title}</Link>
                  )}
                  <small className="adminListSecondary">
                    {item.status === 'published'
                      ? 'Terbit'
                      : item.status === 'trash'
                        ? 'Sampah'
                        : 'Draft'}
                  </small>
                  <small className="adminListSecondary">/{item.slug}</small>
                  {item.parentTitle && (
                    <small className="adminListSecondary">Induk: {item.parentTitle}</small>
                  )}
                </td>
                <td>{item.menuOrder}</td>
                <td>{formatDate(item.updatedAt.toISOString())}</td>
                <td>
                  <div className="adminRowActions">
                    {item.status === 'trash' ? (
                      <TrashActions kind="pages" id={item.id} />
                    ) : (
                      <>
                        <Link href={`/admin/pages/${item.id}`}>Edit</Link>
                        <Link
                          href={
                            item.status === 'published'
                              ? `/${item.slug}`
                              : `/admin/pages/${item.id}/preview`
                          }
                        >
                          {item.status === 'published' ? 'Lihat' : 'Preview'}
                        </Link>
                        <DeleteForm
                          id={item.id}
                          action={deletePage}
                          label="Ke Sampah"
                          confirmation="Pindahkan halaman ini ke Sampah? Halaman dapat dipulihkan sebagai draft."
                        />
                      </>
                    )}
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
