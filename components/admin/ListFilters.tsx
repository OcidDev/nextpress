import Link from 'next/link'
import type { ListParameters } from '@/lib/db/queries/admin-list'

export function ListFilters({
  basePath,
  params,
  label,
  statuses,
}: {
  basePath: string
  params: ListParameters
  label: string
  statuses?: { value: string; label: string }[]
}) {
  return (
    <form
      action={basePath}
      method="get"
      className="adminFilters"
      role="search"
      aria-label={`Filter ${label.toLowerCase()}`}
    >
      <label>
        Cari {label.toLowerCase()}
        <input
          type="search"
          name="q"
          maxLength={120}
          defaultValue={params.q}
          placeholder={`Cari ${label.toLowerCase()}…`}
        />
      </label>
      {statuses && (
        <label>
          Filter status
          <select name="status" defaultValue={params.status}>
            <option value="">Semua status</option>
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {basePath === '/admin/media' && <input type="hidden" name="view" value={params.view} />}
      {params.tag && <input type="hidden" name="tag" value={params.tag} />}
      {params.sort && <input type="hidden" name="sort" value={params.sort} />}
      {params.dir && <input type="hidden" name="dir" value={params.dir} />}
      <button className="button" type="submit">
        Terapkan filter
      </button>
      {(params.q || params.status || params.tag) && (
        <Link
          href={
            params.sort
              ? `${basePath}?${new URLSearchParams({
                  sort: params.sort,
                  dir: params.dir || 'asc',
                  ...(basePath === '/admin/media' && params.view ? { view: params.view } : {}),
                }).toString()}`
              : basePath === '/admin/media' && params.view === 'list'
                ? `${basePath}?view=list`
                : basePath
          }
        >
          Reset filter
        </Link>
      )}
    </form>
  )
}
