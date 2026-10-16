import type { ReactNode } from 'react'
import Link from 'next/link'
import { getAppearance } from '@/lib/db/queries/appearance'
import { getSettings } from '@/lib/db/queries/settings'
import { NavigationMenu } from '@/components/navigation/NavigationMenu'
import { Drawer } from '@/components/ui/Drawer'
import { SearchModal } from '@/components/search/SearchModal'
import { SearchButton } from '@/components/header/SearchButton'
import { MenuButton } from '@/components/header/MenuButton'
import { IntegrationConsent } from '@/components/ui/IntegrationConsent'
import { ViewTracker } from '@/components/analytics/ViewTracker'
import '@/components/site/theme.css'
import '@/components/site/design.css'

/**
 * Kerangka situs: header ringkas, isi halaman, lalu footer ringkas.
 *
 * Sebelumnya susunan ini datang dari pohon blok paket tema. Desain situs kini
 * tetap, jadi struktur core-default ditulis langsung di sini.
 */
export async function SiteFrame({
  children,
  pageTemplate = 'default',
  preview = false,
}: {
  children: ReactNode
  /** Varian template laman; hanya memengaruhi atribut CSS, bukan susunan kerangka. */
  pageTemplate?: string
  preview?: boolean
}) {
  const [appearance, settings] = await Promise.all([getAppearance(), getSettings()])
  const site = appearance.site
  return (
    <div className="themeSite" data-page-template={pageTemplate}>
      <a href="#main-content" className="skipLink">
        Langsung ke konten
      </a>
      {!preview && <ViewTracker enabled={settings.viewsEnabled} site />}
      <header className="cmsSimpleHeader">
        <Link className="cmsSiteName" href="/">
          {site.name}
        </Link>
        <nav aria-label="Menu utama" className="cmsInlineNavigation">
          {site.navigation
            .flatMap(
              (item) => item.children ?? (item.href ? [{ label: item.label, href: item.href }] : []),
            )
            .map((item, index) =>
              'href' in item && item.href ? (
                <Link key={index} href={item.href}>
                  {item.label}
                </Link>
              ) : null,
            )}
        </nav>
        <div className="cmsHeaderControls">
          <SearchButton />
          <MenuButton />
        </div>
      </header>
      {children}
      <footer className="cmsSimpleFooter">
        <Link className="cmsSiteName" href="/">
          {site.name}
        </Link>
        <p>{site.description}</p>
        <nav aria-label="Menu footer">
          {site.footer
            .filter((column) => column.enabled)
            .flatMap((column) => column.links)
            .map((link, index) => (
              <Link href={link.href} key={index}>
                {link.label}
              </Link>
            ))}
        </nav>
        <small>
          © {new Date().getFullYear()} {site.name}
        </small>
      </footer>
      <Drawer>
        <NavigationMenu label="Menu drawer" site={site} />
      </Drawer>
      <SearchModal />
      {!preview && <IntegrationConsent gaId={settings.gaId} adsenseId={settings.adsenseId} />}
    </div>
  )
}
