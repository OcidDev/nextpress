'use client'

import Link from 'next/link'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type NavItem = { label: string; href: string }

/** Fixed flyouts escape the scrollable sidebar, including in icon-only mode. */
export function AdminNavGroup({
  item,
  icon,
  current,
  pathname,
  mobile,
  collapsed,
  badge,
}: {
  item: NavItem & { children?: NavItem[] }
  icon: ReactNode
  current: boolean
  pathname: string
  mobile: boolean
  collapsed: boolean
  badge?: number
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 50, left: 200 })
  const group = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const link = useRef<HTMLAnchorElement>(null)
  const id = useId()
  const hasChildren = Boolean(item.children?.length)

  useEffect(() => {
    setOpen(false)
  }, [pathname, collapsed])
  useEffect(() => {
    if (!open || mobile) return
    const close = () => setOpen(false)
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) close()
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [open, mobile])
  useLayoutEffect(() => {
    if (!open || mobile || !row.current || !panel.current) return
    const anchor = row.current.getBoundingClientRect()
    const height = panel.current.getBoundingClientRect().height
    setPosition({
      left: anchor.right,
      top: Math.max(50, Math.min(anchor.top, window.innerHeight - height - 8)),
    })
  }, [open, mobile])

  return (
    <div
      ref={group}
      className={`adminNavGroup${current ? ' isActive' : ''}${open ? ' isOpen' : ''}`}
      onPointerEnter={(event) => {
        if (!mobile && event.pointerType !== 'touch' && hasChildren) setOpen(true)
      }}
      onPointerLeave={() => {
        if (!mobile) setOpen(false)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          link.current?.focus()
          setOpen(false)
        }
        if (!mobile && hasChildren && event.key === 'ArrowRight') {
          event.preventDefault()
          setOpen(true)
          requestAnimationFrame(() => panel.current?.querySelector<HTMLAnchorElement>('a')?.focus())
        }
      }}
    >
      <div ref={row} className="adminNavRow">
        <Link
          ref={link}
          onFocus={() => {
            if (!mobile && hasChildren) setOpen(true)
          }}
          title={collapsed && !mobile && !hasChildren ? item.label : undefined}
          href={item.href}
          aria-label={item.label}
          aria-current={pathname === item.href ? 'page' : undefined}
          className="adminNavLink"
        >
          {icon}
          <span className="adminNavLabel">{item.label}</span>
          {Boolean(badge) && <span className="adminBadge">{badge}</span>}
        </Link>
        {hasChildren && (
          <button
            type="button"
            className="adminSubmenuToggle"
            aria-label={`Submenu ${item.label}`}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
      {hasChildren && (
        <div
          ref={panel}
          id={id}
          hidden={!open}
          className={`adminSubmenu${mobile ? ' adminSubmenuInline' : ' adminSubmenuFlyout'}`}
          aria-label={`Submenu ${item.label}`}
          role="group"
          style={mobile ? undefined : position}
        >
          {item.children!.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              aria-current={pathname === child.href ? 'page' : undefined}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
