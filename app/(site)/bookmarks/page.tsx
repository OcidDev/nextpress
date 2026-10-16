import { ThemePage } from '@/lib/themes/ThemePage'
import { MainContainer } from '@/components/layout/MainContainer'
import { BookmarkList } from '@/components/blog/BookmarkList'
import { getAppearance } from '@/lib/db/queries/appearance'
import { publicPageMetadata } from '@/lib/content/metadata'
import { getViewStats } from '@/lib/db/queries/views'

export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  return publicPageMetadata({ title: 'Daftar bacaan', path: '/bookmarks', noIndex: true })
}
export default async function BookmarksPage() {
  const appearance = await getAppearance()
  return (
    <ThemePage query={{ kind: 'bookmarks' }}>
      <MainContainer site={appearance.site} announcement={appearance.announcement}>
        <BookmarkList
          options={{
            bookmarks: true,
            showViews:
              appearance.cards.showViews &&
              appearance.site.viewsEnabled &&
              (await getViewStats()).available,
          }}
        />
      </MainContainer>
    </ThemePage>
  )
}
