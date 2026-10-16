'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useBookmarks } from '@/hooks/useBookmarks'
import type { PostSummary } from '@/types'
import { PostCard, type CardOptions } from './PostCard'
import styles from './PostList.module.css'

export function BookmarkList({ options = {} }: { options?: CardOptions }) {
  const bookmarks = useBookmarks()
  const [resolved, setResolved] = useState<{ key: string; items: PostSummary[] } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const ids = bookmarks.items.map((item) => item.id)
  const key = ids.join(',')
  useEffect(() => {
    if (!bookmarks.ready || !key) return
    const controller = new AbortController()
    setError('')
    fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: key.split(',') }),
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Daftar bacaan belum dapat dimuat.')
        const data = (await response.json()) as { items: PostSummary[] }
        if (!Array.isArray(data.items)) throw new Error('Daftar bacaan belum dapat dimuat.')
        if (!controller.signal.aborted) setResolved({ key, items: data.items })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Daftar bacaan belum dapat dimuat.')
      })
    return () => controller.abort()
  }, [bookmarks.ready, key, retry])
  const loading = Boolean(key) && resolved?.key !== key && !error
  const items = resolved?.key === key ? resolved.items : []
  const unavailable =
    !loading && !error && key
      ? bookmarks.items.filter((item) => !items.some((post) => post.id === item.id))
      : []
  return (
    <section>
      <div className={styles.bookmarksHeader}>
        <h1>Daftar bacaan</h1>
        {bookmarks.items.length > 0 && (
          <button className={styles.textButton} type="button" onClick={bookmarks.clear}>
            Hapus semua
          </button>
        )}
      </div>
      <p>Artikel yang disimpan di browser ini untuk dibaca nanti.</p>
      {bookmarks.message && (
        <p className={styles.bookmarksNotice} role="status">
          {bookmarks.message}
        </p>
      )}
      {!bookmarks.ready || loading ? (
        <p role="status" className={styles.bookmarksNotice}>
          Memuat daftar bacaan…
        </p>
      ) : !key ? (
        <div className="emptyState">
          <h2>Belum ada artikel tersimpan</h2>
          <p>Gunakan tombol bookmark pada artikel yang ingin dibaca nanti.</p>
          <Link href="/">Jelajahi artikel</Link>
        </div>
      ) : null}
      {error && (
        <div className={styles.bookmarksNotice}>
          <p role="alert">{error}</p>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setRetry((value) => value + 1)}
          >
            Coba lagi
          </button>
        </div>
      )}
      <div className={styles.grid}>
        {items.map((post) => (
          <PostCard key={post.id} post={post} options={{ ...options, bookmarks: true }} />
        ))}
      </div>
      {unavailable.length > 0 && (
        <section className={styles.unavailable}>
          <h2>Artikel tidak tersedia</h2>
          <p>Artikel berikut telah dihapus atau tidak lagi diterbitkan.</p>
          <ul>
            {unavailable.map((post) => (
              <li key={post.id}>
                <span>{post.title}</span>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => bookmarks.remove(post.id)}
                  aria-label={`Hapus artikel tidak tersedia: ${post.title}`}
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
