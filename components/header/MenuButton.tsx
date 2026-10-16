'use client'
// client
import { HamIcon } from '@/components/ui/icons/HamIcon'
import { openPanel } from '@/lib/ui-events'
import { useEffect, useState } from 'react'

export function MenuButton() {
  const [desktop, setDesktop] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 897px)')
    const update = () => setDesktop(media.matches)
    const state = (event: Event) =>
      setCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed)
    update()
    setCollapsed(
      document.querySelector('.themeSite')?.getAttribute('data-navigation-collapsed') === 'true',
    )
    media.addEventListener('change', update)
    window.addEventListener('nextpress:navigation-state', state)
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('nextpress:navigation-state', state)
    }
  }, [])
  return (
    <button
      type="button"
      className="iconButton"
      aria-label={desktop ? (collapsed ? 'Perluas navigasi' : 'Ringkas navigasi') : 'Buka menu'}
      aria-haspopup={desktop ? undefined : 'dialog'}
      aria-expanded={desktop ? !collapsed : undefined}
      aria-controls={desktop ? 'desktop-navigation' : 'panel-menu'}
      onClick={() => {
        if (window.matchMedia('(min-width: 897px)').matches)
          window.dispatchEvent(new CustomEvent('nextpress:toggle-navigation'))
        else openPanel('menu')
      }}
    >
      <HamIcon aria-hidden="true" />
    </button>
  )
}
