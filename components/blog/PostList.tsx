import type { Appearance } from '@/lib/content/appearance'
import { getAppearance } from '@/lib/db/queries/appearance'
import { getAdminSession } from '@/lib/admin'
import { getViewStats } from '@/lib/db/queries/views'
import type { Paginated, PostSummary } from '@/types'
import { applyFilters, hasFilter } from '@/lib/extensions/hooks'
import { bootExtensions } from '@/lib/extensions/bootstrap'
import { PostCard } from './PostCard'
import { PostFeed } from './PostFeed'
import { PostPagination, paginationHref } from './PostPagination'
import styles from './PostList.module.css'

export async function PostList({
  result,
  basePath = '/',
  query,
  layout = 'grid',
  paginate = true,
  context = 'archive',
  appearance,
  preview = false,
  mobileColumns,
  feed,
}: {
  result: Paginated<PostSummary>
  basePath?: string
  query?: string
  layout?: 'grid' | 'list'
  paginate?: boolean
  context?: 'home' | 'archive'
  appearance?: Appearance
  preview?: boolean
  mobileColumns?: 1 | 2
  feed?: { endpoint: string; key: string }
}) {
  const config = appearance ?? (await getAppearance())
  const options = {
    bookmarks: config.cards.bookmarks && !preview,
    showViews:
      config.cards.showViews && config.site.viewsEnabled && (await getViewStats()).available,
    editable: !preview && config.cards.quickEdit && Boolean(await getAdminSession()),
    preview,
  }
  await bootExtensions()
  // `post_card` (EXT-01) berjalan atas data tiap kartu sebelum dirender. Tanpa
  // ekstensi yang mendaftar, daftar asli dipakai apa adanya sehingga tidak ada
  // pekerjaan tambahan sama sekali.
  const items = hasFilter('post_card')
    ? await Promise.all(result.items.map((post) => applyFilters('post_card', post)))
    : result.items
  function href(page: number) {
    return paginationHref({ basePath, query })(page)
  }
  if (!items.length)
    return (
      <>
        <div className="emptyState">
          <h2>{result.total > 0 ? 'Halaman ini tidak memiliki artikel' : 'Belum ada artikel'}</h2>
          <p>
            {result.total > 0
              ? 'Pilih halaman yang tersedia untuk melanjutkan membaca.'
              : query
                ? 'Tidak ada artikel yang cocok dengan kata kunci Anda.'
                : 'Artikel akan tampil setelah diterbitkan.'}
          </p>
        </div>
        {paginate && (
          <PostPagination
            page={result.page}
            totalPages={result.totalPages}
            href={href}
            variant="back"
          />
        )}
      </>
    )
  const gridClass = `${layout === 'list' ? styles.list : context === 'home' ? styles.homeGrid : styles.grid} ${layout === 'list' ? '' : 'cmsPostGrid'}`
  if (feed && paginate)
    return (
      <PostFeed
        key={`${feed.key}:${result.page}`}
        result={{ ...result, items }}
        endpoint={feed.endpoint}
        collectionKey={feed.key}
        gridClass={gridClass}
        mobileColumns={mobileColumns ?? config.home.mobileColumns}
        options={options}
        basePath={basePath}
      />
    )
  return (
    <>
      <div className={gridClass} data-mobile-columns={mobileColumns ?? config.home.mobileColumns}>
        {items.map((post) => (
          <PostCard key={post.id} post={post} options={options} />
        ))}
      </div>
      {paginate && <PostPagination page={result.page} totalPages={result.totalPages} href={href} />}
    </>
  )
}
