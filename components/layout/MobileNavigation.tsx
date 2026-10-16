'use client'
// client
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  SearchIcon,
  MenuIcon,
  MoonSunIcon,
  ArowUpCircleIcon,
} from '@/components/ui/icons'
import { mobileNavigation } from '@/data/navigation'
import { openPanel } from '@/lib/ui-events'
import { scrollToTop } from '@/components/ui/BackToTop'
import styles from './MobileNavigation.module.css'

const icons = { HomeIcon, SearchIcon, MenuIcon, MoonSunIcon, ArowUpCircleIcon }

export function MobileNavigation({
  search = true,
  theme = true,
}: {
  search?: boolean
  theme?: boolean
}) {
  const pathname = usePathname()
  return (
    <nav className={styles.navigation} aria-label="Navigasi mobile">
      <ul>
        {mobileNavigation
          .filter(
            (item) => !(item.action === 'search' && !search) && !(item.action === 'mode' && !theme),
          )
          .map((item) => {
            const Icon = icons[item.icon as keyof typeof icons]
            const content = (
              <>
                <Icon aria-hidden="true" />
                <span className="srOnly">{item.label}</span>
              </>
            )
            const panel =
              item.action === 'mode'
                ? 'theme'
                : item.action === 'menu' || item.action === 'search'
                  ? item.action
                  : undefined
            return (
              <li key={item.label}>
                {item.kind === 'link' ? (
                  <Link
                    href={item.href ?? '/'}
                    aria-current={pathname === item.href ? 'page' : undefined}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-haspopup={panel ? 'dialog' : undefined}
                    aria-controls={panel ? `panel-${panel}` : undefined}
                    onClick={() => {
                      if (panel) openPanel(panel)
                      else if (item.action === 'top') scrollToTop()
                    }}
                  >
                    {content}
                  </button>
                )}
              </li>
            )
          })}
      </ul>
    </nav>
  )
}
