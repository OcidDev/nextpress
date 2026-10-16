'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useUnsavedChanges() {
  const [dirty, updateDirty] = useState(false)
  const allowLeave = useRef(false)
  const setDirty = useCallback((value: boolean) => {
    allowLeave.current = !value
    updateDirty(value)
  }, [])
  useEffect(() => {
    if (!dirty) return
    function warn(event: BeforeUnloadEvent) {
      if (allowLeave.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    function warnLink(event: MouseEvent) {
      if (
        allowLeave.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        !link.href ||
        link.getAttribute('href')?.startsWith('#')
      )
        return
      const next = new URL(link.href)
      if (
        next.origin === location.origin &&
        next.pathname === location.pathname &&
        next.search === location.search
      )
        return
      if (!window.confirm('Ada perubahan yang belum disimpan. Tinggalkan editor ini?')) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        // A confirmed full navigation must not show a second beforeunload prompt.
        setDirty(false)
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', warnLink, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', warnLink, true)
    }
  }, [dirty, setDirty])
  return { dirty, setDirty }
}
