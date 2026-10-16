'use client'

import { useBookmarks } from '@/hooks/useBookmarks'
import { useState } from 'react'
import { BookmarkAltIcon } from '@/components/ui/icons/BookmarkAltIcon'
import styles from './PostList.module.css'

export function BookmarkButton({
  post,
  label = false,
}: {
  post: { id: string; slug: string; title: string }
  label?: boolean
}) {
  const bookmarks = useBookmarks()
  const [feedback, setFeedback] = useState('')
  const saved = bookmarks.items.some((item) => item.id === post.id)
  const title = `${saved ? 'Hapus dari daftar bacaan' : 'Simpan artikel'}: ${post.title}`
  return (
    <span className={styles.bookmarkControl}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={title}
        title={title}
        aria-pressed={saved}
        disabled={!bookmarks.ready}
        onClick={() => setFeedback(bookmarks.toggle(post))}
      >
        <BookmarkAltIcon aria-hidden="true" />
        {label && <span>{saved ? 'Tersimpan' : 'Baca nanti'}</span>}
      </button>
      {feedback && (
        <span role="status" className={styles.storageNotice}>
          {feedback}
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setFeedback('')}
            aria-label="Tutup pesan bookmark"
          >
            Tutup
          </button>
        </span>
      )}
    </span>
  )
}
