import type { ReactNode } from 'react'
import type { Appearance } from '@/lib/content/appearance'
import type { SiteSettings } from '@/lib/content/settings'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { MobileNavigation } from '@/components/layout/MobileNavigation'
import { NavigationMenu } from '@/components/navigation/NavigationMenu'
import { Drawer } from '@/components/ui/Drawer'
import { SearchModal } from '@/components/search/SearchModal'
import { IntegrationConsent } from '@/components/ui/IntegrationConsent'
import './theme.css'
import { PluginSlot } from './PluginSlot'
import { ViewTracker } from '@/components/analytics/ViewTracker'
import { getViewStats } from '@/lib/db/queries/views'

export async function SiteFrame({
  appearance,
  settings,
  preview = false,
  children,
}: {
  appearance: Appearance
  settings: SiteSettings
  preview?: boolean
  children: ReactNode
}) {
  const siteViews = appearance.footer.showStats ? (await getViewStats()).siteTotal : null
  return (
    <div
      className="themeSite"
      data-width={appearance.style.width}
      data-font-size={appearance.style.fontSize}
      data-design={appearance.style.design}
      data-navigation-default={appearance.header.navigationDefault}
      data-header-sticky={appearance.header.sticky}
    >
      <a href="#main-content" className="skipLink">
        Langsung ke konten
      </a>
      <Header appearance={appearance} />
      {!preview && <ViewTracker enabled={settings.viewsEnabled} site />}
      {children}
      <PluginSlot slot="footer" preview={preview} />
      <Footer appearance={appearance} preview={preview} siteViews={siteViews} />
      <Drawer>
        <NavigationMenu label="Menu drawer" site={appearance.site} />
      </Drawer>
      {appearance.header.search && <SearchModal />}
      <MobileNavigation search={appearance.header.search} theme={appearance.header.themeToggle} />
      {!preview && <IntegrationConsent gaId={settings.gaId} adsenseId={settings.adsenseId} />}
    </div>
  )
}
