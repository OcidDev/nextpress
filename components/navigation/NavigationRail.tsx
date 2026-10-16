'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from '@/components/layout/MainContainer.module.css'
import { ArowDownIcon } from '@/components/ui/icons'

export function NavigationRail({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const rail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCollapsed(
      rail.current?.closest<HTMLElement>('.themeSite')?.dataset.navigationDefault === 'rail',
    )
    const toggle = () => setCollapsed((value) => !value)
    window.addEventListener('nextpress:toggle-navigation', toggle)
    return () => window.removeEventListener('nextpress:toggle-navigation', toggle)
  }, [])

  useEffect(() => {
    const site = rail.current?.closest<HTMLElement>('.themeSite')
    if (site) site.dataset.navigationCollapsed = String(collapsed)
    window.dispatchEvent(new CustomEvent('nextpress:navigation-state', { detail: { collapsed } }))
    return () => {
      if (site) delete site.dataset.navigationCollapsed
    }
  }, [collapsed])

  useEffect(() => {
    const navigation = rail.current
    const site = navigation?.closest<HTMLElement>('.themeSite')
    const header = site?.querySelector<HTMLElement>('#site-header')
    if (!navigation || !header || site?.dataset.headerSticky !== 'false') return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        navigation.style.setProperty(
          '--navigation-top',
          `${Math.max(0, header.getBoundingClientRect().bottom)}px`,
        )
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      navigation.style.removeProperty('--navigation-top')
    }
  }, [])

  return (
    <div
      id="desktop-navigation"
      ref={rail}
      className={styles.desktopNavigation}
      data-collapsed={collapsed}
    >
      {children}
      {collapsed && (
        <button
          type="button"
          className={styles.railExpand}
          aria-label="Buka navigasi lengkap"
          onClick={() => setCollapsed(false)}
        >
          <ArowDownIcon aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
