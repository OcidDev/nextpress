import Link from 'next/link'
import type { AppearanceSite } from '@/lib/content/appearance'
import { getSettings } from '@/lib/db/queries/settings'
import { NavigationItem } from './NavigationItem'
import { SocialLinks } from './SocialLinks'
import styles from './NavigationMenu.module.css'

export async function NavigationMenu({
  label = 'Navigasi utama',
  site,
  desktop = false,
}: {
  label?: string
  site?: AppearanceSite
  desktop?: boolean
}) {
  const { navigation: mainNavigation, secondaryNavigation } = site ?? (await getSettings())
  return (
    <nav aria-label={label} className={styles.navigation} data-desktop={desktop}>
      <ul className={styles.menu}>
        {mainNavigation.map((item, index) => (
          <NavigationItem key={`${index}-${item.label}`} item={item} />
        ))}
      </ul>
      <div className={styles.bottom}>
        <div className={styles.secondary}>
          {secondaryNavigation.map((item, index) => (
            <Link key={`${index}-${item.href}`} href={item.href} aria-label={item.label}>
              {item.label}
            </Link>
          ))}
        </div>
        <SocialLinks site={site} />
      </div>
    </nav>
  )
}
