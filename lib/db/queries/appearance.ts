import { getActiveTheme, normalizeThemeId } from '@/lib/themes/manager'
import 'server-only'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { requireCapability } from '@/lib/admin'
import {
  appearanceEnvelopeSchema,
  appearanceSchema,
  appearanceSite,
  defaultAppearance,
  type Appearance,
  type AppearanceEnvelope,
} from '@/lib/content/appearance'
import { cleanHtml } from '@/lib/content/sanitize'
import { defaultSettings, settingsSchema, type SiteSettings } from '@/lib/content/settings'
import { getDb, hasDatabase } from '@/lib/db'
import { authors, categories, media, pages, posts, plugins } from '@/lib/db/schema'
import { getPluginChoices } from '@/lib/db/queries/plugins'
import { pluginManifestSchema, type PluginChoice } from '@/lib/plugins/manifest'
import { getRequestOptions, withOptionsTransaction } from '@/lib/core/options-server'
import type { OptionsApi } from '@/lib/core/options'

export const appearanceKeys = {
  draft: 'appearance:draft',
  active: 'appearance:active',
  previous: 'appearance:previous',
} as const

export type AppearanceTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>['transaction']>[0]
>[0]

export type AppearanceEditorData = {
  draft: AppearanceEnvelope
  active: AppearanceEnvelope
  hasPrevious: boolean
  choices: {
    posts: { id: string; title: string; slug: string }[]
    pages: { id: string; title: string; slug: string }[]
    authors: { id: string; name: string }[]
    categories: { id: string; slug: string; name: string; permalink?: string }[]
    plugins: PluginChoice[]
  }
}

export class AppearanceValidationError extends Error {}

async function lockAppearance(tx: AppearanceTransaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
}

function parseEnvelope(value: unknown): AppearanceEnvelope | undefined {
  const parsed = appearanceEnvelopeSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

async function documents(options: OptionsApi) {
  const values = await options.getOptions(['site', ...Object.values(appearanceKeys)])
  const parsedSite = settingsSchema.safeParse(values.get('site'))
  const site = parsedSite.success ? parsedSite.data : defaultSettings()
  const active = parseEnvelope(values.get(appearanceKeys.active)) ?? {
    revision: 0,
    config: defaultAppearance(site),
  }
  const draft = parseEnvelope(values.get(appearanceKeys.draft)) ?? active
  return { site, active, draft, previous: parseEnvelope(values.get(appearanceKeys.previous)) }
}

async function write(options: OptionsApi, id: string, value: unknown) {
  await options.updateOption(id, value)
}

function guardRevision(current: AppearanceEnvelope, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0 || current.revision !== revision)
    throw new AppearanceValidationError(
      'Rancangan sudah berubah di tab lain. Muat ulang halaman untuk memakai versi terbaru.',
    )
}

function normalizedAppearance(value: unknown): Appearance {
  const config = appearanceSchema.parse(value)
  for (const section of config.home.sections) {
    if (section.type === 'hero') section.text = cleanHtml(section.text)
  }
  for (const widget of [...config.sidebar, ...config.footerWidgets]) {
    if (widget.type === 'about' || widget.type === 'text') widget.text = cleanHtml(widget.text)
  }
  return config
}

async function validateReferences(tx: AppearanceTransaction, config: Appearance) {
  if (config.home.mode === 'page') {
    const [page] = config.home.pageId
      ? await tx
          .select({ id: pages.id })
          .from(pages)
          .where(eq(pages.id, config.home.pageId))
          .for('share')
      : []
    if (!page) throw new AppearanceValidationError('Pilih halaman beranda yang masih tersedia.')
  }
  const enabledSections = config.home.sections.filter((section) => section.enabled)
  if (config.announcement.enabled && !config.announcement.text.trim())
    throw new AppearanceValidationError('Isi pesan banner informasi yang aktif.')
  if (Boolean(config.announcement.buttonLabel) !== Boolean(config.announcement.buttonHref))
    throw new AppearanceValidationError('Lengkapi label dan tautan tombol informasi.')
  for (const section of enabledSections) {
    if (section.type === 'featured') {
      const [post] = section.postId
        ? await tx
            .select({ id: posts.id })
            .from(posts)
            .where(
              and(
                eq(posts.id, section.postId),
                eq(posts.status, 'published'),
                lte(posts.publishedAt, new Date()),
              ),
            )
            .for('share')
        : []
      if (!post)
        throw new AppearanceValidationError(
          `Pilih artikel terbit yang tersedia untuk bagian ${section.title || 'unggulan'}.`,
        )
    }
    if (section.type === 'category') {
      const [category] = section.categorySlug
        ? await tx
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.slug, section.categorySlug))
            .for('share')
        : []
      if (!category)
        throw new AppearanceValidationError(
          `Pilih kategori yang tersedia untuk bagian ${section.title || 'kategori'}.`,
        )
    }
    if (section.type === 'hero' && Boolean(section.buttonLabel) !== Boolean(section.buttonHref))
      throw new AppearanceValidationError('Lengkapi label dan tautan tombol pembuka.')
  }
  for (const widget of [...config.sidebar, ...config.footerWidgets].filter(
    (item) => item.enabled,
  )) {
    if (widget.type === 'author') {
      const [author] = widget.authorId
        ? await tx
            .select({ id: authors.id })
            .from(authors)
            .where(eq(authors.id, widget.authorId))
            .for('share')
        : []
      if (!author) throw new AppearanceValidationError('Pilih profil penulis yang masih tersedia.')
    }
    if (widget.type === 'image' && !widget.image)
      throw new AppearanceValidationError('Pilih gambar untuk widget gambar yang aktif.')
  }
  const imageUrls = [
    config.site.logo,
    config.footer.logo,
    ...config.home.sections.flatMap((section) => (section.type === 'hero' ? [section.image] : [])),
    ...[...config.sidebar, ...config.footerWidgets].flatMap((widget) =>
      widget.type === 'image' ? [widget.image] : [],
    ),
  ]
  const pluginReferences = [
    ...enabledSections,
    ...[...config.sidebar, ...config.footerWidgets].filter((item) => item.enabled),
  ].filter((item) => item.type === 'plugin')
  const pluginIds = [...new Set(pluginReferences.map((item) => item.pluginId).filter(Boolean))]
  const installed = pluginIds.length
    ? await tx
        .select({ id: plugins.id, manifest: plugins.manifest })
        .from(plugins)
        .where(inArray(plugins.id, pluginIds))
        .for('share')
    : []
  for (const reference of pluginReferences) {
    const manifest = pluginManifestSchema.safeParse(
      installed.find((item) => item.id === reference.pluginId)?.manifest,
    )
    if (
      !reference.pluginId ||
      !reference.widgetId ||
      !manifest.success ||
      !manifest.data.widgets.some((widget) => widget.id === reference.widgetId)
    )
      throw new AppearanceValidationError(
        'Pilih widget dari plugin yang masih terpasang untuk bagian atau widget plugin yang aktif.',
      )
  }
  const mediaIds = [
    ...new Set(
      imageUrls
        .map((url) => /^\/api\/media\/([a-f0-9]{32})$/.exec(url)?.[1])
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (mediaIds.length) {
    const available = await tx
      .select({ id: media.id })
      .from(media)
      .where(inArray(media.id, mediaIds))
      .for('share')
    if (available.length !== mediaIds.length)
      throw new AppearanceValidationError(
        'Ada gambar CMS yang sudah dihapus. Pilih gambar pengganti.',
      )
  }
}

export async function getAppearance(): Promise<Appearance> {
  if (!hasDatabase()) return defaultAppearance()
  return (await documents(getRequestOptions())).active.config
}

export async function getAppearanceEditor(): Promise<AppearanceEditorData> {
  await requireCapability('edit_theme_options')
  const db = getDb()
  const [current, postChoices, pageChoices, authorChoices, categoryChoices, pluginChoices] =
    await Promise.all([
      documents(getRequestOptions()),
      db
        .select({ id: posts.id, title: posts.title, slug: posts.slug })
        .from(posts)
        .where(and(eq(posts.status, 'published'), lte(posts.publishedAt, new Date())))
        .orderBy(posts.title),
      db
        .select({ id: pages.id, title: pages.title, slug: pages.slug })
        .from(pages)
        .orderBy(pages.title),
      db.select({ id: authors.id, name: authors.name }).from(authors).orderBy(authors.name),
      db
        .select({ id: categories.id, slug: categories.slug, name: categories.name })
        .from(categories)
        .orderBy(categories.name),
      getPluginChoices(),
    ])
  const settings = settingsSchema.parse(await getRequestOptions().getOption('site'))
  return {
    draft: current.draft,
    active: current.active,
    hasPrevious: Boolean(current.previous),
    choices: {
      posts: postChoices,
      pages: pageChoices,
      authors: authorChoices,
      categories: categoryChoices.map((category) => ({
        ...category,
        permalink: `/${settings.categoryBase || 'category'}/${category.slug}`,
      })),
      plugins: pluginChoices,
    },
  }
}

export async function saveAppearanceData(
  value: unknown,
  revision: number,
): Promise<AppearanceEnvelope> {
  await requireCapability('edit_theme_options')
  const config = normalizedAppearance(value)
  return withOptionsTransaction(async (tx, options) => {
    await lockAppearance(tx)
    const current = await documents(options)
    guardRevision(current.draft, revision)
    const draft = { revision: current.draft.revision + 1, config }
    await write(options, appearanceKeys.draft, draft)
    return draft
  })
}

export async function applyAppearanceData(revision: number): Promise<AppearanceEnvelope> {
  await requireCapability('edit_theme_options')
  return withOptionsTransaction(async (tx, options) => {
    await guardAppearanceTheme(tx, options)
    await lockAppearance(tx)
    const current = await documents(options)
    guardRevision(current.draft, revision)
    await validateReferences(tx, current.draft.config)
    const active = { revision: current.draft.revision + 1, config: current.draft.config }
    await write(options, appearanceKeys.previous, current.active)
    await write(options, appearanceKeys.active, active)
    await write(options, appearanceKeys.draft, active)
    await write(options, 'site', {
      ...current.site,
      ...active.config.site,
      showOnFront: active.config.home.mode,
      pageOnFront: active.config.home.pageId,
    })
    return active
  })
}

export async function discardAppearanceData(revision: number): Promise<AppearanceEnvelope> {
  await requireCapability('edit_theme_options')
  return withOptionsTransaction(async (tx, options) => {
    await lockAppearance(tx)
    const current = await documents(options)
    guardRevision(current.draft, revision)
    const draft = { revision: current.draft.revision + 1, config: current.active.config }
    await write(options, appearanceKeys.draft, draft)
    return draft
  })
}

export async function restoreAppearanceData(revision: number): Promise<AppearanceEnvelope> {
  await requireCapability('edit_theme_options')
  return withOptionsTransaction(async (tx, options) => {
    await guardAppearanceTheme(tx, options)
    await lockAppearance(tx)
    const current = await documents(options)
    guardRevision(current.draft, revision)
    if (!current.previous)
      throw new AppearanceValidationError('Belum ada tampilan sebelumnya untuk dipulihkan.')
    await validateReferences(tx, current.previous.config)
    const active = { revision: current.draft.revision + 1, config: current.previous.config }
    await write(options, appearanceKeys.previous, current.active)
    await write(options, appearanceKeys.active, active)
    await write(options, appearanceKeys.draft, active)
    await write(options, 'site', {
      ...current.site,
      ...active.config.site,
      showOnFront: active.config.home.mode,
      pageOnFront: active.config.home.pageId,
    })
    return active
  })
}

// Call inside the settings transaction before writing key "site". The shared lock
// makes this atomic with draft/apply, and the bumped revision rejects stale tabs.
export async function syncAppearanceSiteSettings(
  tx: AppearanceTransaction,
  site: SiteSettings,
  options: OptionsApi,
  keys?: (keyof SiteSettings)[],
) {
  await lockAppearance(tx)
  const current = await documents(options)
  const stored = await options.getOptions([appearanceKeys.active, appearanceKeys.draft])
  const present = new Set(stored.keys())
  const updatedSite = appearanceSite(site)
  const fieldKeys = keys?.filter((key) => key in updatedSite)
  const reading = !keys || keys.includes('showOnFront') || keys.includes('postsPerPage')
  if (reading) {
    for (const [key, envelope] of [
      [appearanceKeys.active, current.active],
      [appearanceKeys.draft, current.draft],
    ] as const) {
      const config = {
        ...envelope.config,
        home: {
          ...envelope.config.home,
          mode: site.showOnFront,
          pageId: site.pageOnFront,
          sections: envelope.config.home.sections.map((section) =>
            section.type === 'latest' ? { ...section, limit: site.postsPerPage } : section,
          ),
        },
      }
      await write(options, key, { revision: envelope.revision + 1, config })
      envelope.config = config
      envelope.revision++
    }
  }
  if (fieldKeys && !fieldKeys.length) return
  const patch = fieldKeys
    ? Object.fromEntries(
        fieldKeys.map((key) => [key, updatedSite[key as keyof typeof updatedSite]]),
      )
    : updatedSite
  const changed = (config: Appearance) =>
    Object.entries(patch).some(
      ([key, value]) =>
        JSON.stringify(config.site[key as keyof typeof config.site]) !== JSON.stringify(value),
    )
  if (present.has(appearanceKeys.active) && changed(current.active.config))
    await write(options, appearanceKeys.active, {
      revision: current.active.revision + 1,
      config: { ...current.active.config, site: { ...current.active.config.site, ...patch } },
    })
  if (present.has(appearanceKeys.draft) && changed(current.draft.config))
    await write(options, appearanceKeys.draft, {
      revision: current.draft.revision + 1,
      config: { ...current.draft.config, site: { ...current.draft.config.site, ...patch } },
    })
}

async function guardAppearanceTheme(tx: AppearanceTransaction, options: OptionsApi) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
  const theme = await getActiveTheme()
  const activeId = await options.getOption('active_theme')
  if (
    !theme.manifest.capabilities.includes('appearance-editor') ||
    (typeof activeId === 'string' && normalizeThemeId(activeId) !== theme.manifest.id)
  )
    throw new AppearanceValidationError(
      'Tema aktif sudah berubah. Aktifkan tema yang mendukung pengaturan ini sebelum menerapkan rancangan.',
    )
}
