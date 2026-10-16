'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function ViewTracker({
  enabled,
  canonicalPath,
  postId,
  site = false,
}: {
  canonicalPath?: string
  enabled: boolean
  postId?: string
  site?: boolean
}) {
  const pathname = usePathname()
  const path = canonicalPath || pathname
  useEffect(() => {
    if (!enabled || (!postId && !site) || /^\/(?:admin|preview|api)(?:\/|$)/.test(path)) return
    let sent = false
    const send = () => {
      if (sent || document.visibilityState !== 'visible') return
      sent = true
      void fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, ...(postId ? { postId } : {}), site }),
        keepalive: true,
      }).catch(() => {})
    }
    const timer = window.setTimeout(send, 1500)
    const visible = () => {
      if (document.visibilityState === 'visible') send()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [enabled, path, postId, site])
  return null
}
