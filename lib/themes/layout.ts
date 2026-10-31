import { z } from 'zod'
import {
  appearanceV2Schema,
  appearanceSchema,
  defaultAppearance,
  type Appearance,
} from '@/lib/content/appearance'
import { defaultSettings, type SiteSettings } from '@/lib/content/settings'

/** Declarative layout contract. Packages cannot own site settings or execute editor code. */
const shape = appearanceV2Schema.shape
export const layoutChromeSchema = z
  .object({
    schemaVersion: shape.schemaVersion,
    preset: shape.preset,
    style: shape.style,
    header: shape.header,
    home: z
      .object({
        mobileColumns: shape.home.shape.mobileColumns,
        sections: shape.home.shape.sections,
      })
      .strict(),
    article: shape.article,
    sidebar: shape.sidebar,
    footerWidgets: shape.footerWidgets,
    footer: shape.footer,
    announcement: shape.announcement,
    cards: shape.cards,
  })
  .strict()
  .superRefine((value, ctx) => {
    const parsed = appearanceSchema.safeParse(withSite(value, defaultSettings()))
    if (!parsed.success)
      ctx.addIssue({ code: 'custom', message: 'Susunan tema tidak valid atau ID widget duplikat.' })
  })
export const layoutPanels = ['style', 'header', 'home', 'article', 'sidebar', 'footer'] as const
export const themeLayoutSchema = z
  .object({
    version: z.literal(1),
    panels: z
      .array(z.enum(layoutPanels))
      .min(1)
      .max(6)
      .refine((items) => new Set(items).size === items.length),
    defaults: layoutChromeSchema,
    presets: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
            name: z.string().min(1).max(100),
            config: layoutChromeSchema,
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict()
  .refine(
    (value) => new Set(value.presets.map((item) => item.id)).size === value.presets.length,
    'ID preset duplikat',
  )
export type ThemeLayout = z.infer<typeof themeLayoutSchema>
export type LayoutChrome = Omit<Appearance, 'site' | 'home'> & {
  home: Pick<Appearance['home'], 'mobileColumns' | 'sections'>
}
export function layoutChrome(config: Appearance): LayoutChrome {
  const { site: _site, home, ...chrome } = config
  void _site
  return { ...chrome, home: { mobileColumns: home.mobileColumns, sections: home.sections } }
}
export function withSite(config: LayoutChrome, site: SiteSettings): Appearance {
  const base = defaultAppearance(site)
  return {
    ...config,
    site: base.site,
    home: { ...config.home, mode: site.showOnFront, pageId: site.pageOnFront },
  }
}
export function layoutDefaults(layout: ThemeLayout | undefined, site: SiteSettings): Appearance {
  return layout
    ? withSite(layout.defaults, site)
    : withSite(layoutChrome(defaultAppearance(site)), site)
}
/** Preserve panels the package did not declare, even if the browser submits them. */
export function permittedLayout(
  current: Appearance,
  submitted: Appearance,
  layout: ThemeLayout,
): Appearance {
  const result = { ...current }
  for (const panel of layout.panels) {
    if (panel === 'style') {
      result.style = submitted.style
      result.cards = submitted.cards
      result.preset = submitted.preset
    }
    if (panel === 'header') {
      result.header = submitted.header
      result.announcement = submitted.announcement
    }
    if (panel === 'home')
      result.home = { ...submitted.home, mode: current.home.mode, pageId: current.home.pageId }
    if (panel === 'article') result.article = submitted.article
    if (panel === 'sidebar') result.sidebar = submitted.sidebar
    if (panel === 'footer') {
      result.footer = submitted.footer
      result.footerWidgets = submitted.footerWidgets
    }
  }
  return result
}
