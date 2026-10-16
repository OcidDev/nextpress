import Link from 'next/link'

export interface SortableHeaderProps {
  column: string
  label: string
  currentSort?: string
  currentDir?: 'asc' | 'desc'
  basePath: string
  params?: Record<string, unknown>
  sortKey?: string
  dirKey?: string
  className?: string
  defaultDir?: 'asc' | 'desc'
}

export function buildSortHref(
  basePath: string,
  params: Record<string, unknown> = {},
  column: string,
  nextDir: 'asc' | 'desc',
  sortKey = 'sort',
  dirKey = 'dir',
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      key !== 'page' &&
      key !== sortKey &&
      key !== dirKey
    ) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null && item !== '') {
            query.append(key, String(item))
          }
        }
      } else {
        query.set(key, String(value))
      }
    }
  }
  query.set(sortKey, column)
  query.set(dirKey, nextDir)
  return `${basePath}${query.size ? `?${query.toString()}` : ''}`
}

export function SortableHeader({
  column,
  label,
  currentSort,
  currentDir,
  basePath,
  params = {},
  sortKey = 'sort',
  dirKey = 'dir',
  className,
  defaultDir = 'asc',
}: SortableHeaderProps) {
  const isActive = currentSort === column
  const activeDir = isActive ? currentDir || defaultDir : undefined
  const nextDir: 'asc' | 'desc' = isActive ? (activeDir === 'asc' ? 'desc' : 'asc') : defaultDir

  const href = buildSortHref(basePath, params, column, nextDir, sortKey, dirKey)
  const ariaSort = isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : undefined

  return (
    <th aria-sort={ariaSort} className={className}>
      <Link href={href} className="adminSortHeader">
        <span>{label}</span>
        <span className="adminSortIconWrap" aria-hidden="true">
          <svg
            className={`adminSortIcon ${
              isActive ? (activeDir === 'desc' ? 'isDesc' : 'isAsc') : 'isInactive'
            }`}
            viewBox="0 0 16 16"
            width="14"
            height="14"
          >
            <path d="M8 3.5l4 4.5H4l4-4.5z" />
          </svg>
        </span>
      </Link>
    </th>
  )
}
