import Link from 'next/link'
import { listedPosts, type ListSearch } from '@/lib/db/queries/admin-list'
import { ListFilters } from '@/components/admin/ListFilters'
import { AdminPagination, listHref } from '@/components/admin/AdminPagination'
import { PostsTable } from '@/components/admin/PostsTable'
import { requireCmsUser } from '@/lib/admin'

export default async function PostsPage({ searchParams }: { searchParams: Promise<ListSearch> }) {
  const session = await requireCmsUser()
  const search = await searchParams
  const result = await listedPosts(search)
  const statuses = [
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Menunggu review' },
    { value: 'published', label: 'Terbit' },
  ]
  return (
    <>
      <div className="adminPageHeading">
        <h1>Artikel</h1>
        <Link className="button" href="/admin/posts/new">
          Tulis artikel
        </Link>
      </div>
      <nav className="adminStatusTabs" aria-label="Status artikel">
        <Link
          href={listHref('/admin/posts', result.params, { status: '', page: 1 })}
          aria-current={!result.params.status ? 'page' : undefined}
        >
          Semua
        </Link>
        {statuses.map((status) => (
          <Link
            key={status.value}
            href={listHref('/admin/posts', result.params, { status: status.value, page: 1 })}
            aria-current={result.params.status === status.value ? 'page' : undefined}
          >
            {status.label} ({result.statusCounts[status.value] || 0})
          </Link>
        ))}
      </nav>
      <ListFilters
        basePath="/admin/posts"
        params={result.params}
        label="Artikel"
        statuses={statuses}
      />
      {result.params.tag && (
        <p>
          Artikel dengan tag <strong>{result.params.tag}</strong>.
        </p>
      )}
      <PostsTable
        key={JSON.stringify([
          result.params.q,
          result.params.status,
          result.params.tag,
          result.params.sort,
          result.params.dir,
          result.page,
        ])}
        rows={result.rows}
        canPublish={result.canPublish}
        userId={session.user.id}
        searchParams={search}
        currentSort={result.params.sort}
        currentDir={result.params.dir}
      />
      {!result.rows.length && (
        <p>
          {result.params.q || result.params.status || result.params.tag
            ? 'Tidak ada artikel yang sesuai dengan filter.'
            : 'Belum ada artikel.'}
        </p>
      )}
      <AdminPagination basePath="/admin/posts" {...result} />
    </>
  )
}
