'use client'
// client
import { SearchIcon } from '@/components/ui/icons/SearchIcon'
import { openPanel } from '@/lib/ui-events'

export function SearchButton({ label = 'Cari artikel…' }: { label?: string }) {
  return (
    <button
      type="button"
      className="iconButton headerSearch"
      aria-label="Cari artikel"
      aria-haspopup="dialog"
      aria-controls="panel-search"
      onClick={() => openPanel('search')}
    >
      <SearchIcon aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
