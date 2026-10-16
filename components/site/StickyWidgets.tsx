'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export function StickyWidgets({ children }: { children: ReactNode }) {
  const group = useRef<HTMLDivElement>(null)
  const [fits, setFits] = useState(false)
  useEffect(() => {
    const element = group.current
    if (!element) return
    const measure = () => {
      const site = element.closest('.themeSite')
      const headerOffset = site
        ? parseFloat(getComputedStyle(site).getPropertyValue('--header-offset'))
        : 60
      setFits(
        element.getBoundingClientRect().height <= window.innerHeight - (headerOffset || 0) - 20,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return (
    <div ref={group} className="themeWidgetGroup themeStickyWidgets" data-fits={fits}>
      {children}
    </div>
  )
}
