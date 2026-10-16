import { SearchButton } from './SearchButton'
import { ThemeToggle } from './ThemeToggle'
import Link from 'next/link'
import { BookmarkIcon } from '@/components/ui/icons'

export function HeaderActions({
  search = true,
  theme = true,
  bookmarks = false,
}: {
  search?: boolean
  theme?: boolean
  bookmarks?: boolean
}) {
  return (
    <div className="headerActions">
      {search && <SearchButton />}
      {bookmarks && (
        <Link className="iconButton" href="/bookmarks" aria-label="Daftar bacaan tersimpan">
          <BookmarkIcon aria-hidden="true" />
        </Link>
      )}
      {theme && <ThemeToggle />}
    </div>
  )
}
