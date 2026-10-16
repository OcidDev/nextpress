'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BookmarkIcon } from '@/components/ui/icons'

type Category = { permalink?: string; id: string; slug: string; name: string; total: number }

export function CategoryWidget({
  categories,
  initialCount,
  expandable,
  showCounts,
}: {
  categories: Category[]
  initialCount: number
  expandable: boolean
  showCounts: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const restId = useId()
  const pathname = usePathname()
  const visibleCount = expandable ? initialCount : categories.length
  const remaining = categories.slice(visibleCount)
  const list = (items: Category[]) =>
    items.map((category) => (
      <li key={category.id}>
        <Link
          href={category.permalink || `/category/${category.slug}`}
          aria-label={showCounts ? `${category.name}: ${category.total} artikel` : category.name}
          aria-current={
            pathname === (category.permalink || `/category/${category.slug}`) ? 'page' : undefined
          }
          title={category.name}
        >
          <span className="themeCategoryName">{category.name}</span>
          <span className="themeCategoryMeta" aria-hidden="true">
            {showCounts && <span>{category.total}</span>}
            <BookmarkIcon />
          </span>
        </Link>
      </li>
    ))
  return (
    <div className="themeCategories">
      <ul className="themeCategoryList">{list(categories.slice(0, visibleCount))}</ul>
      {remaining.length > 0 && (
        <>
          <ul id={restId} className="themeCategoryList" hidden={!expanded}>
            {list(remaining)}
          </ul>
          <button
            type="button"
            className="themeCategoryMore"
            aria-expanded={expanded}
            aria-controls={restId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Tampilkan lebih sedikit' : `Tampilkan selengkapnya (+${remaining.length})`}
          </button>
        </>
      )}
    </div>
  )
}
