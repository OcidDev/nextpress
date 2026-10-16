import type { Appearance } from '@/lib/content/appearance'
import { Logo } from '@/components/header/Logo'
import { MenuButton } from '@/components/header/MenuButton'
import { HeaderActions } from '@/components/header/HeaderActions'
import { HeaderScroll } from './HeaderScroll'
import styles from './Header.module.css'

export function Header({ appearance }: { appearance?: Appearance }) {
  return (
    <header
      id="site-header"
      className={styles.header}
      data-layout={appearance?.header.layout}
      style={appearance && !appearance.header.sticky ? { position: 'relative' } : undefined}
    >
      <div className={styles.inner}>
        <MenuButton />
        <Logo site={appearance?.site} />
        <div className={styles.actions}>
          <HeaderActions
            search={appearance?.header.search}
            theme={appearance?.header.themeToggle}
            bookmarks={appearance?.cards.bookmarks || appearance?.article.bookmarks}
          />
        </div>
      </div>
      <HeaderScroll />
    </header>
  )
}
