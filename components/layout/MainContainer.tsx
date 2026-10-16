import type { ReactNode } from 'react'
import type { Appearance, AppearanceSite } from '@/lib/content/appearance'
import { DesktopNavigation } from './DesktopNavigation'
import { Announcement } from '@/components/theme/Announcement'
import styles from './MainContainer.module.css'

export function MainContainer({
  children,
  sidebar,
  site,
  announcement,
}: {
  children: ReactNode
  sidebar?: ReactNode
  site?: AppearanceSite
  announcement?: Appearance['announcement']
}) {
  return (
    <div className={`${styles.shell} cmsContentShell`}>
      <DesktopNavigation site={site} />
      <div className={`${styles.body} cmsContentBody`}>
        {announcement && <Announcement config={announcement} />}
        <div className={`${sidebar ? styles.columns : ''} cmsContentColumns`}>
          <main id="main-content" tabIndex={-1} className={`${styles.main} cmsContentMain`}>
            {children}
          </main>
          {sidebar}
        </div>
      </div>
    </div>
  )
}
