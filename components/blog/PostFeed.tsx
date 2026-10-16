'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Paginated, PostSummary } from '@/types'
import { ArrowRightIcon } from '@/components/ui/icons/ArrowRightIcon'
import { PostCard, type CardOptions } from './PostCard'
import styles from './PostList.module.css'

type FeedResponse = { result: Paginated<PostSummary>; key: string; options: CardOptions }
export function PostFeed({
  result,
  endpoint,
  collectionKey,
  gridClass,
  mobileColumns,
  options,
  basePath,
}: {
  result: Paginated<PostSummary>
  endpoint: string
  collectionKey: string
  gridClass: string
  mobileColumns: 1 | 2
  options: CardOptions
  basePath: string
}) {
  const [pages, setPages] = useState<Record<number, PostSummary[]>>({ [result.page]: result.items })
  const [currentPage, setCurrentPage] = useState(result.page)
  const [totalPages, setTotalPages] = useState(result.totalPages)
  const [cardOptions, setCardOptions] = useState(options)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [changed, setChanged] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    setReady(true)
    function back(event: PopStateEvent) {
      const saved = event.state?.blogFeed
      setCurrentPage(saved?.key === collectionKey ? saved.page : result.page)
    }
    window.addEventListener('popstate', back)
    return () => {
      request.current?.abort()
      window.removeEventListener('popstate', back)
    }
  }, [collectionKey, result.page])
  const seen = new Set<string>()
  const items = Object.entries(pages)
    .filter(([page]) => Number(page) <= currentPage)
    .sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([, posts]) => posts)
    .filter((post) => {
      if (seen.has(post.id)) return false
      seen.add(post.id)
      return true
    })
  const href = (page: number) => `${basePath}?${new URLSearchParams({ page: String(page) })}`
  async function loadMore() {
    if (request.current || currentPage >= totalPages || changed) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const url = new URL(endpoint, window.location.origin)
      url.searchParams.set('page', String(currentPage + 1))
      url.searchParams.set('key', collectionKey)
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      if (response.status === 409) {
        setChanged(true)
        throw new Error('Daftar artikel telah berubah. Muat ulang halaman untuk melanjutkan.')
      }
      if (!response.ok)
        throw new Error(
          'Artikel berikutnya belum dapat dimuat. Coba lagi atau gunakan tautan halaman.',
        )
      const data = (await response.json()) as Partial<FeedResponse>
      if (
        data.key !== collectionKey ||
        !data.result ||
        data.result.page !== currentPage + 1 ||
        !Array.isArray(data.result.items) ||
        !data.options
      )
        throw new Error('Daftar artikel tidak sesuai. Muat ulang halaman.')
      const nextResult = data.result
      setPages((previous) => ({ ...previous, [nextResult.page]: nextResult.items }))
      setCurrentPage(nextResult.page)
      setTotalPages(nextResult.totalPages)
      setCardOptions(data.options)
      // Native history keeps every page directly reloadable; Back restores the preceding group.
      if (!options.preview)
        window.history.pushState(
          { ...window.history.state, blogFeed: { key: collectionKey, page: data.result.page } },
          '',
          href(data.result.page),
        )
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error && cause.message.startsWith('Daftar artikel')
            ? cause.message
            : 'Artikel berikutnya belum dapat dimuat. Coba lagi atau gunakan tautan halaman.',
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
      request.current = null
    }
  }
  return (
    <>
      <div className={gridClass} data-mobile-columns={mobileColumns} aria-busy={loading}>
        {items.map((post) => (
          <PostCard key={post.id} post={post} options={cardOptions} />
        ))}
      </div>
      <div className={styles.loadMoreArea}>
        {currentPage < totalPages && (
          <button
            type="button"
            className={styles.loadMore}
            disabled={!ready || loading || changed}
            onClick={loadMore}
          >
            {loading ? 'Memuat artikel…' : 'Muat postingan lainnya'}
            <ArrowRightIcon aria-hidden="true" />
          </button>
        )}
        <p className={styles.feedNotice} role="status">
          {error ||
            (currentPage >= totalPages
              ? 'Semua postingan telah ditampilkan.'
              : loading
                ? 'Memuat halaman berikutnya.'
                : '')}
        </p>
        {changed && (
          <button
            className={styles.textButton}
            type="button"
            onClick={() => window.location.reload()}
          >
            Muat ulang halaman
          </button>
        )}
      </div>
      <nav className={styles.pagination} aria-label="Pagination">
        {currentPage > 1 && <Link href={href(currentPage - 1)}>← Sebelumnya</Link>}
        <span>
          Halaman {currentPage} dari {totalPages}
        </span>
        {currentPage < totalPages && <Link href={href(currentPage + 1)}>Berikutnya →</Link>}
      </nav>
    </>
  )
}
