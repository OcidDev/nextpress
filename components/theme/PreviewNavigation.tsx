'use client'
import { useEffect } from 'react'
export function PreviewNavigation({
  revision = 0,
  themeId,
  draft = false,
}: {
  revision?: number
  themeId?: string
  draft?: boolean
}) {
  useEffect(() => {
    const destination = (path: string) =>
      themeId
        ? `/preview/theme/${themeId}?${new URLSearchParams({ path, draft: draft ? '1' : '0', revision: String(revision) })}`
        : `/preview/appearance?${new URLSearchParams({ path, revision: String(revision) })}`
    function intercept(event: MouseEvent) {
      const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.getAttribute('href')?.startsWith('#')) return
      const url = new URL(anchor.href)
      event.preventDefault()
      event.stopPropagation()
      if (url.origin !== location.origin) return
      if (/^\/(?:admin|api|preview)(?:\/|$)/.test(url.pathname)) return
      location.assign(destination(url.pathname + url.search))
    }
    function submit(event: SubmitEvent) {
      const form = event.target as HTMLFormElement
      if (form.method.toLowerCase() !== 'get') return
      const url = new URL(form.action)
      if (url.origin !== location.origin) return
      event.preventDefault()
      event.stopPropagation()
      const data = new FormData(form)
      for (const [key, value] of data)
        if (typeof value === 'string') url.searchParams.set(key, value)
      location.assign(destination(url.pathname + url.search))
    }
    document.addEventListener('submit', submit, true)
    document.addEventListener('click', intercept, true)
    return () => {
      document.removeEventListener('click', intercept, true)
      document.removeEventListener('submit', submit, true)
    }
  }, [revision, themeId, draft])
  return null
}
