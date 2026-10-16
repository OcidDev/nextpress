'use client'
// client — native dialog handles focus trapping, Escape and return focus.
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { CloseIcon } from '@/components/ui/icons/CloseIcon'
import type { SitePanel } from '@/lib/ui-events'
import styles from './Modal.module.css'

export function Modal({
  panel,
  title,
  children,
  drawer = false,
}: {
  panel: SitePanel
  title: string
  children: ReactNode
  drawer?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const pathname = usePathname()

  useEffect(() => {
    const open = () => {
      if (!ref.current?.open) ref.current?.showModal()
    }
    window.addEventListener(`nextpress:open-${panel}`, open)
    return () => window.removeEventListener(`nextpress:open-${panel}`, open)
  }, [panel])

  useEffect(() => {
    ref.current?.close()
  }, [pathname])

  return (
    <dialog
      ref={ref}
      id={`panel-${panel}`}
      aria-labelledby={titleId}
      className={`${styles.dialog} ${drawer ? styles.drawer : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            ref.current?.close()
        }
        if ((event.target as HTMLElement).closest('a[href]')) ref.current?.close()
      }}
    >
      <div className={styles.heading}>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="iconButton"
          aria-label={`Tutup ${title.toLowerCase()}`}
          onClick={() => ref.current?.close()}
        >
          <CloseIcon aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  )
}
