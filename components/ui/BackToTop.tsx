'use client'
// client
import { ArowUpIcon } from './icons/ArowUpIcon'
import { useEffect, useState } from 'react'
import styles from './BackToTop.module.css'

export function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  })
}

export function BackToTop() {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const distance = document.documentElement.scrollHeight - window.innerHeight
        setProgress(distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0)
        setVisible(window.scrollY > 300)
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return (
    <button
      type="button"
      className={styles.button}
      onClick={scrollToTop}
      aria-label="Kembali ke atas"
      hidden={!visible}
    >
      <svg className={styles.progress} viewBox="0 0 48 48" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="22"
          pathLength="100"
          style={{ strokeDashoffset: 100 - progress * 100 }}
        />
      </svg>
      <ArowUpIcon aria-hidden="true" />
    </button>
  )
}
