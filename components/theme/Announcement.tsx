'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Appearance } from '@/lib/content/appearance'
import styles from './Announcement.module.css'

export function Announcement({ config }: { config: Appearance['announcement'] }) {
  const [closed, setClosed] = useState(false)
  const key = `blog-announcement:${config.text}:${config.buttonHref}`
  useEffect(() => {
    try {
      setClosed(sessionStorage.getItem(key) === 'closed')
    } catch {
      setClosed(false)
    }
  }, [key])
  if (!config.enabled || !config.text.trim() || closed) return null
  return (
    <section className={styles.banner} aria-label="Informasi situs">
      <p>{config.text}</p>
      {config.buttonLabel && config.buttonHref && (
        <Link href={config.buttonHref}>{config.buttonLabel}</Link>
      )}
      <button
        type="button"
        aria-label="Tutup informasi situs"
        onClick={() => {
          setClosed(true)
          try {
            sessionStorage.setItem(key, 'closed')
          } catch {
            /* Closing still works without storage. */
          }
        }}
      >
        ×
      </button>
    </section>
  )
}
