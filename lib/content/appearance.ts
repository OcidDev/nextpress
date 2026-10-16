import { z } from 'zod'
import { defaultSettings, settingsSchema, type SiteSettings } from './settings'
import { safeUrl } from './validation'
import { pluginIdSchema } from '@/lib/plugins/manifest'

export const appearanceSiteSchema = settingsSchema.omit({ gaId: true, adsenseId: true })
const itemId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/)
const referenceId = z.string().regex(/^(?:[a-f0-9]{32})?$/)
const categorySlug = z
  .string()
  .max(160)
  .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/)
const text = z.string().max(10000)
const title = z.string().trim().max(160)
const href = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => /^\/(?!\/|\\)/.test(value) || /^https?:\/\//i.test(value),
    'Tautan tidak valid',
  )
  .refine((value) => !/[\s\\\u0000-\u001f]/.test(value), 'Tautan tidak valid')
const optionalHref = z.union([z.literal(''), href])
const link = z.object({ label: z.string().trim().min(1).max(80), href }).strict()
const common = { id: itemId, enabled: z.boolean(), title }
const widgetCommon = { ...common, sticky: z.boolean().default(false) }
const collection = { limit: z.number().int().min(1).max(20), layout: z.enum(['grid', 'list']) }
const pluginReference = {
  pluginId: z.union([z.literal(''), pluginIdSchema]),
  widgetId: z.union([z.literal(''), pluginIdSchema]),
}

export const sectionTypes = ['hero', 'latest', 'featured', 'category', 'plugin'] as const
export const sectionLabels: Record<(typeof sectionTypes)[number], string> = {
  hero: 'Pembuka',
  latest: 'Artikel terbaru',
  featured: 'Artikel unggulan',
  category: 'Artikel per kategori',
  plugin: 'Widget plugin',
}
export const sectionSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...common,
      type: z.literal('hero'),
      text,
      image: safeUrl,
      alt: z.string().max(250),
      buttonLabel: z.string().trim().max(80),
      buttonHref: optionalHref,
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('latest'),
      ...collection,
      limit: z.number().int().min(1).max(100),
      pagination: z.enum(['links', 'load-more']).default('links'),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('featured'),
      postId: referenceId,
      layout: collection.layout,
      presentation: z.enum(['standard', 'pinned']).default('standard'),
    })
    .strict(),
  z.object({ ...common, type: z.literal('category'), categorySlug, ...collection }).strict(),
  z.object({ ...common, type: z.literal('plugin'), ...pluginReference }).strict(),
])

export const widgetTypes = [
  'about',
  'recent',
  'popular',
  'categories',
  'archive',
  'author',
  'menu',
  'social',
  'text',
  'image',
  'plugin',
] as const
export const widgetLabels: Record<(typeof widgetTypes)[number], string> = {
  about: 'Tentang situs',
  recent: 'Artikel terbaru',
  popular: 'Sering dibaca',
  categories: 'Kategori',
  archive: 'Arsip tahunan',
  author: 'Profil penulis',
  menu: 'Tautan menu',
  social: 'Sosial',
  text: 'Teks',
  image: 'Gambar',
  plugin: 'Widget plugin',
}
export const widgetSchema = z.discriminatedUnion('type', [
  z.object({ ...widgetCommon, type: z.literal('about'), text }).strict(),
  z.object({ ...widgetCommon, type: z.literal('recent'), limit: collection.limit }).strict(),
  z
    .object({
      ...widgetCommon,
      type: z.literal('popular'),
      limit: collection.limit,
      range: z.enum(['7days', 'alltime']),
    })
    .strict(),
  z
    .object({
      ...widgetCommon,
      type: z.literal('categories'),
      limit: z.number().int().min(1).max(200),
      initialCount: z.number().int().min(1).max(20).default(6),
      showCounts: z.boolean().default(true),
      sort: z.enum(['alphabetical', 'count']).default('count'),
      expandable: z.boolean().default(false),
    })
    .strict(),
  z.object({ ...widgetCommon, type: z.literal('archive'), limit: collection.limit }).strict(),
  z.object({ ...widgetCommon, type: z.literal('author'), authorId: referenceId }).strict(),
  z.object({ ...widgetCommon, type: z.literal('menu'), links: z.array(link).max(20) }).strict(),
  z.object({ ...widgetCommon, type: z.literal('social') }).strict(),
  z.object({ ...widgetCommon, type: z.literal('text'), text }).strict(),
  z
    .object({ ...widgetCommon, type: z.literal('image'), image: safeUrl, alt: z.string().max(250) })
    .strict(),
  z.object({ ...widgetCommon, type: z.literal('plugin'), ...pluginReference }).strict(),
])

export const footerDefaults = {
  intro: '',
  name: '',
  description: '',
  logo: '',
  socialStyle: 'icons' as const,
  showSocial: true,
  showStats: false,
  showWaves: false,
  showBackToTop: true,
  copyrightText: '',
}
const footerSchema = z
  .object({
    intro: z.string().max(160),
    name: z.string().max(100),
    description: z.string().max(500),
    logo: safeUrl,
    socialStyle: z.enum(['icons', 'text']),
    showSocial: z.boolean(),
    showStats: z.boolean(),
    showWaves: z.boolean(),
    showBackToTop: z.boolean(),
    copyrightText: z.string().max(500),
  })
  .strict()
const announcementDefaults = { enabled: false, text: '', buttonLabel: '', buttonHref: '' }
const cardDefaults = { bookmarks: false, showViews: false, quickEdit: false }

const uniqueItems = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((item) => item.id)).size === items.length
const appearanceV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    preset: z.enum(['blog', 'magazine', 'minimal', 'reference']),
    site: appearanceSiteSchema,
    style: z
      .object({
        width: z.enum(['normal', 'wide']),
        fontSize: z.enum(['normal', 'large']),
        design: z.enum(['standard', 'reference']).default('standard'),
      })
      .strict(),
    header: z
      .object({
        layout: z.enum(['standard', 'centered']),
        sticky: z.boolean(),
        search: z.boolean(),
        themeToggle: z.boolean(),
        navigationDefault: z.enum(['expanded', 'rail']).default('expanded'),
      })
      .strict(),
    home: z
      .object({
        mode: z.enum(['posts', 'page']),
        pageId: referenceId,
        mobileColumns: z.union([z.literal(1), z.literal(2)]).default(1),
        sections: z
          .array(sectionSchema)
          .max(20)
          .refine(uniqueItems, 'ID bagian harus unik')
          .refine(
            (items) => items.filter((item) => item.type === 'latest').length <= 1,
            'Hanya satu daftar artikel utama diperbolehkan',
          ),
      })
      .strict(),
    article: z
      .object({
        sidebar: z.boolean(),
        metadata: z.boolean(),
        cover: z.boolean(),
        comments: z.boolean(),
        toc: z.boolean().default(true),
        share: z.boolean().default(true),
        bookmarks: z.boolean().default(false),
      })
      .strict(),
    sidebar: z.array(widgetSchema).max(20).refine(uniqueItems, 'ID widget harus unik'),
    footerWidgets: z.array(widgetSchema).max(20).refine(uniqueItems, 'ID widget harus unik'),
    footer: footerSchema.default(footerDefaults),
    announcement: z
      .object({
        enabled: z.boolean(),
        text: z.string().max(1000),
        buttonLabel: z.string().max(80),
        buttonHref: optionalHref,
      })
      .strict()
      .default(announcementDefaults),
    cards: z
      .object({ bookmarks: z.boolean(), showViews: z.boolean(), quickEdit: z.boolean() })
      .strict()
      .default(cardDefaults),
  })
  .strict()
  .refine(
    (config) => uniqueItems([...config.home.sections, ...config.sidebar, ...config.footerWidgets]),
    'ID bagian dan widget harus unik di seluruh tampilan',
  )

function upgradeAppearance(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const config = value as Record<string, unknown>
  if (config.schemaVersion !== 1) return value
  const upgradeWidgets = (widgets: unknown) =>
    Array.isArray(widgets)
      ? widgets.map((widget) => {
          if (!widget || typeof widget !== 'object' || Array.isArray(widget)) return widget
          const item = widget as Record<string, unknown>
          return item.type === 'categories'
            ? {
                ...item,
                initialCount: item.limit,
                sort: 'count',
                expandable: false,
                showCounts: true,
              }
            : item
        })
      : widgets
  return {
    ...config,
    schemaVersion: 2,
    sidebar: upgradeWidgets(config.sidebar),
    footerWidgets: upgradeWidgets(config.footerWidgets),
  }
}

export const appearanceSchema = z.preprocess(upgradeAppearance, appearanceV2Schema)

export const appearanceEnvelopeSchema = z
  .object({
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    config: appearanceSchema,
  })
  .strict()
export type Appearance = z.infer<typeof appearanceSchema>
export type AppearanceSite = z.infer<typeof appearanceSiteSchema>
export type AppearanceEnvelope = z.infer<typeof appearanceEnvelopeSchema>
export type Section = z.infer<typeof sectionSchema>
export type Widget = z.infer<typeof widgetSchema>
export type AppearanceActionState = { error?: string; success?: string; revision?: number }

export function appearanceSite(site: SiteSettings): AppearanceSite {
  return appearanceSiteSchema.parse(site)
}

function newItemId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}
export function createSection<T extends Section['type']>(
  type: T,
  id?: string,
): Extract<Section, { type: T }>
export function createSection(type: Section['type'], id = newItemId('section')): Section {
  const common = { id, enabled: true, title: sectionLabels[type] }
  switch (type) {
    case 'hero':
      return { ...common, type, text: '', image: '', alt: '', buttonLabel: '', buttonHref: '' }
    case 'latest':
      return { ...common, type, limit: 7, layout: 'grid', pagination: 'links' }
    case 'featured':
      return { ...common, type, postId: '', layout: 'grid', presentation: 'standard' }
    case 'category':
      return { ...common, type, categorySlug: '', limit: 6, layout: 'grid' }
    case 'plugin':
      return { ...common, type, pluginId: '', widgetId: '' }
  }
}
export function createWidget<T extends Widget['type']>(
  type: T,
  id?: string,
): Extract<Widget, { type: T }>
export function createWidget(type: Widget['type'], id = newItemId('widget')): Widget {
  const common = { id, enabled: true, sticky: false, title: widgetLabels[type] }
  switch (type) {
    case 'about':
    case 'text':
      return { ...common, type, text: '' }
    case 'recent':
    case 'archive':
      return { ...common, type, limit: 5 }
    case 'popular':
      return { ...common, type, limit: 5, range: '7days' }
    case 'categories':
      return {
        ...common,
        type,
        limit: 200,
        initialCount: 6,
        showCounts: true,
        sort: 'alphabetical',
        expandable: true,
      }
    case 'author':
      return { ...common, type, authorId: '' }
    case 'menu':
      return { ...common, type, links: [] }
    case 'social':
      return { ...common, type }
    case 'image':
      return { ...common, type, image: '', alt: '' }
    case 'plugin':
      return { ...common, type, pluginId: '', widgetId: '' }
  }
}

export function defaultAppearance(site: SiteSettings = defaultSettings()): Appearance {
  return {
    schemaVersion: 2,
    preset: 'blog',
    site: appearanceSite(site),
    style: { width: 'normal', fontSize: 'normal', design: 'standard' },
    header: {
      layout: 'standard',
      sticky: true,
      search: true,
      themeToggle: true,
      navigationDefault: 'expanded',
    },
    home: {
      mode: 'posts',
      pageId: '',
      mobileColumns: 1,
      sections: [createSection('latest', 'home-latest')],
    },
    article: {
      sidebar: true,
      metadata: true,
      cover: true,
      comments: true,
      toc: true,
      share: true,
      bookmarks: false,
    },
    sidebar: [{ ...createWidget('about', 'sidebar-about'), title: '' }],
    footerWidgets: [],
    footer: { ...footerDefaults },
    announcement: { ...announcementDefaults },
    cards: { ...cardDefaults },
  }
}

export function appearancePreset(preset: Appearance['preset'], current: Appearance): Appearance {
  const config = defaultAppearance({ ...current.site, gaId: '', adsenseId: '' })
  config.preset = preset
  if (preset === 'magazine') {
    config.style.width = 'wide'
    config.home.sections = [createSection('hero'), createSection('latest')]
    config.sidebar.push(createWidget('recent'), createWidget('categories'))
  } else if (preset === 'minimal') {
    config.header.layout = 'centered'
    config.article.sidebar = false
    config.home.sections = [{ ...createSection('latest'), layout: 'list' }]
    config.sidebar = []
  } else if (preset === 'reference') {
    config.style.design = 'reference'
    config.header.navigationDefault = 'rail'
    config.home.mobileColumns = 2
    const oldFeatured = current.home.sections.find(
      (section) => section.type === 'featured' && section.postId,
    )
    config.home.sections = [
      {
        ...createSection('featured'),
        title: 'Disematkan',
        presentation: 'pinned',
        postId: oldFeatured?.type === 'featured' ? oldFeatured.postId : '',
        enabled: Boolean(oldFeatured?.type === 'featured' && oldFeatured.postId),
      },
      { ...createSection('latest'), title: 'Postingan Terbaru', limit: 9, pagination: 'load-more' },
    ]
    config.sidebar = [createWidget('popular'), createWidget('categories')]
    config.cards = { bookmarks: true, showViews: true, quickEdit: true }
    config.article.bookmarks = true
    config.footer = { ...footerDefaults, socialStyle: 'text', showWaves: true, showStats: true }
  }
  return config
}
