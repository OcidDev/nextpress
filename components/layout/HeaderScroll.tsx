'use client'
// client — only the scroll observer, header markup stays on the server.
import { useEffect } from 'react'

export function HeaderScroll() {
  useEffect(() => {
    const header = document.getElementById('site-header')
    const update = () => {
      if (header) header.dataset.scrolled = String(window.scrollY > 20)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return null
}
