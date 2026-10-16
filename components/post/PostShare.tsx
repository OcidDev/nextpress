'use client'

import { useState } from 'react'
import { FacebookRIcon } from '@/components/ui/icons/FacebookRIcon'
import { WhatsappRIcon } from '@/components/ui/icons/WhatsappRIcon'
import { TwitterRIcon } from '@/components/ui/icons/TwitterRIcon'
import { ShareIcon } from '@/components/ui/icons/ShareIcon'
import { LinkIcon } from '@/components/ui/icons/LinkIcon'
import styles from './ArticleContent.module.css'

export function PostShare({
  title,
  url,
  compact = false,
}: {
  title: string
  url: string
  compact?: boolean
}) {
  const [message, setMessage] = useState('')
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title, url })
      else {
        await navigator.clipboard.writeText(url)
        setMessage('Tautan artikel disalin.')
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setMessage('Tautan belum dapat dibagikan. Salin alamat dari browser.')
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Tautan artikel disalin.')
    } catch {
      setMessage('Tautan belum dapat disalin. Salin alamat dari browser.')
    }
  }
  if (compact)
    return (
      <div className={styles.shareCompact}>
        <button
          type="button"
          className={styles.action}
          aria-label="Bagikan artikel"
          title="Bagikan artikel"
          onClick={share}
        >
          <ShareIcon aria-hidden="true" />
        </button>
        <span className={styles.compactMessage} role="status">
          {message}
        </span>
      </div>
    )
  return (
    <section className={styles.share} aria-label="Bagikan artikel">
      <span className={styles.shareLabel}>Bagikan:</span>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url })}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Bagikan ke Facebook"
      >
        <FacebookRIcon aria-hidden="true" />
        <span>Bagikan</span>
      </a>
      <a
        href={`https://api.whatsapp.com/send?${new URLSearchParams({ text: `${title} ${url}` })}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Bagikan ke WhatsApp"
      >
        <WhatsappRIcon aria-hidden="true" />
        <span>Bagikan</span>
      </a>
      <a
        href={`https://twitter.com/intent/tweet?${new URLSearchParams({ url, text: title })}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Bagikan ke Twitter / X"
      >
        <TwitterRIcon aria-hidden="true" />
        <span>Tweet</span>
      </a>
      <button
        type="button"
        onClick={share}
        aria-label="Bagikan ke aplikasi lain"
        title="Bagikan ke aplikasi lain"
      >
        <ShareIcon aria-hidden="true" />
      </button>
      <button type="button" onClick={copy} aria-label="Salin tautan" title="Salin tautan">
        <LinkIcon aria-hidden="true" />
      </button>
      <span className={styles.shareMessage} role="status">
        {message}
      </span>
    </section>
  )
}
