import Link from 'next/link'
import type { ListParameters } from '@/lib/db/queries/admin-list'

export function listHref(
  basePath: string,
  params: ListParameters,
  updates: Partial<ListParameters> = {},
) {
  const value = { ...params, ...updates }
  const query = new URLSearchParams()
  if (value.month) query.set('month', value.month)
  if (value.q) query.set('q', value.q)
  if (value.status) query.set('status', value.status)
  if (value.tag) query.set('tag', value.tag)
  if (value.role) query.set('role', value.role)
  if (basePath === '/admin/media') query.set('view', value.view)
  if (value.sort) query.set('sort', value.sort)
  if (value.dir) query.set('dir', value.dir)
  if (value.lsort) query.set('lsort', value.lsort)
  if (value.ldir) query.set('ldir', value.ldir)
  if (value.page > 1) query.set('page', String(value.page))
  return `${basePath}${query.size ? `?${query}` : ''}`
}

export function AdminPagination({
  basePath,
  page,
  pageCount,
  total,
  params,
}: {
  basePath: string
  page: number
  pageCount: number
  total: number
  params: ListParameters
}) {
  return (
    <nav className="adminPagination" aria-label="Navigasi daftar">
      <span>
        {total} item · Halaman {page} dari {pageCount}
      </span>
      <div className="adminActions">
        {page > 1 ? (
          <Link href={listHref(basePath, params, { page: page - 1 })}>Sebelumnya</Link>
        ) : (
          <span aria-disabled="true">Sebelumnya</span>
        )}
        {page < pageCount ? (
          <Link href={listHref(basePath, params, { page: page + 1 })}>Berikutnya</Link>
        ) : (
          <span aria-disabled="true">Berikutnya</span>
        )}
      </div>
    </nav>
  )
}
