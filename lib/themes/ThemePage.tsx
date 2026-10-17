import type { CSSProperties, ReactNode } from 'react'
import { getThemeCustomizationState } from './customization-server'
import { themeCustomizationStyle } from './customization'
import { getActiveTheme } from './manager'
import { getPageTemplates } from './page-templates'
import { themeAssetUrl, type ThemePackage } from './package'
import {
  getTemplateHierarchy,
  resolveTemplate,
  type TemplateQueryContext,
} from '@/lib/core/templates'
import { renderBlockTree } from '@/lib/blocks/render'
import { blockRegistry } from '@/lib/blocks/registry'
import type { BlockContext } from '@/lib/blocks/context'
import { appearanceSite } from '@/lib/content/appearance'
import { getAppearance } from '@/lib/db/queries/appearance'
import { getSettings } from '@/lib/db/queries/settings'
import { NavigationMenu } from '@/components/navigation/NavigationMenu'
import { Drawer } from '@/components/ui/Drawer'
import { SearchModal } from '@/components/search/SearchModal'
import { IntegrationConsent } from '@/components/ui/IntegrationConsent'
import { ViewTracker } from '@/components/analytics/ViewTracker'
import '@/components/theme/theme.css'

/** Every package (bundled or uploaded) is resolved and rendered through this path. */
export async function ThemePage({
  query,
  context,
  children,
  previewTheme,
  previewDraft = false,
}: {
  query: TemplateQueryContext
  context?: Partial<BlockContext>
  previewTheme?: ThemePackage
  previewDraft?: boolean
  children?: ReactNode
}) {
  const [theme, appearance, settings] = await Promise.all([
    previewTheme ?? getActiveTheme(),
    getAppearance(),
    getSettings(),
  ])
  const template = resolveTemplate(getTemplateHierarchy(query), Object.keys(theme.templates))
  // front-page wins on a static homepage, as in WordPress's hierarchy.
  const selectedPageTemplate =
    context?.page?.pageTemplate &&
    context.page.pageTemplate !== 'default' &&
    (query.kind === 'page' || (query.kind === 'front_page' && !theme.templates['front-page']))
      ? (await getPageTemplates(theme)).find((item) => item.value === context.page!.pageTemplate)
      : undefined
  const customization = theme.customization
    ? await getThemeCustomizationState(theme.manifest.id)
    : null
  const themeStyle =
    theme.customization && customization
      ? themeCustomizationStyle(
          theme.customization,
          context?.preview && previewDraft
            ? (customization.draft ?? customization.active)
            : customization.active,
        )
      : undefined
  // Identity, navigation, and social links come from the core "site" option. The
  // appearance projection already mirrors it; building it here keeps the renderer
  // independent of how a revision was stored.
  const site = appearanceSite(settings)
  const blockContext: BlockContext = {
    site,
    appearance,
    ...context,
    routeContent: children,
  }
  const { content, report } = await renderBlockTree(
    (selectedPageTemplate?.template ?? theme.templates[template]!).blocks,
    {
      context: blockContext,
      registry: blockRegistry,
      parts: Object.fromEntries(
        Object.entries(theme.parts).map(([name, part]) => [name, part.blocks]),
      ),
    },
  )
  if (
    report.unknown.length ||
    report.invalid.length ||
    report.unresolved.length ||
    report.truncated.length
  )
    console.error('[themes] Template tidak lengkap:', theme.manifest.id, template, report)
  return (
    <div
      className="themeSite"
      style={themeStyle as CSSProperties}
      data-theme-package={theme.manifest.id}
      data-theme-version={theme.hash}
      data-theme-template={selectedPageTemplate?.name ?? template}
    >
      <link rel="stylesheet" href={themeAssetUrl(theme.manifest.id, theme.hash, 'style.css')} />
      <a href="#main-content" className="skipLink">
        Langsung ke konten
      </a>
      {!context?.preview && <ViewTracker enabled={settings.viewsEnabled} site />}
      {content}
      <Drawer>
        <NavigationMenu label="Menu drawer" site={site} />
      </Drawer>
      <SearchModal />
      {!context?.preview && (
        <IntegrationConsent gaId={settings.gaId} adsenseId={settings.adsenseId} />
      )}
    </div>
  )
}
