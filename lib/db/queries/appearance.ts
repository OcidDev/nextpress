import { getActiveTheme, normalizeThemeId } from '@/lib/themes/manager'
import 'server-only'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { requireCapability } from '@/lib/admin'
import {
  appearanceChrome,
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

/**
 * Identity, navigation, footer links, social links, and reading settings live in
 * the core "site" option, not in an appearance revision. Envelopes keep a copy of
 * those fields only because existing revisions were stored that way and because
 * the renderer expects one object; the copy is refreshed from core on every read,
 * so a settings change can never be shadowed by a stale draft or a restore.
 */
function themeNeutral(site: SiteSettings, config: Appearance): Appearance {
  return {
    ...config,
    site: appearanceSite(site),
    home: { ...config.home, mode: site.showOnFront, pageId: site.pageOnFront },
  }
}

async function documents(options: OptionsApi) {
  const values = await options.getOptions(['site', ...Object.values(appearanceKeys)])
  const parsedSite = settingsSchema.safeParse(values.get('site'))
  const site = parsedSite.success ? parsedSite.data : defaultSettings()
  const parsedActive = parseEnvelope(values.get(appearanceKeys.active))
  const active = parsedActive
    ? { ...parsedActive, config: themeNeutral(site, parsedActive.config) }
    : { revision: 0, config: defaultAppearance(site) }
  const parsedDraft = parseEnvelope(values.get(appearanceKeys.draft))
  const draft = parsedDraft
    ? { ...parsedDraft, config: themeNeutral(site, parsedDraft.config) }
    : active
  const parsedPrevious = parseEnvelope(values.get(appearanceKeys.previous))
  const previous = parsedPrevious
    ? { ...parsedPrevious, config: themeNeutral(site, parsedPrevious.config) }
    : undefined
  return { site, active, draft, previous }
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
          .where(and(eq(pages.id, config.home.pageId), eq(pages.status, 'published')))
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
        .where(eq(pages.status, 'published'))
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
  const submitted = normalizedAppearance(value)
  return withOptionsTransaction(async (tx, options) => {
    await lockAppearance(tx)
    const current = await documents(options)
    guardRevision(current.draft, revision)
    // The draft owns theme chrome only. Accepting site or home routing fields
    // from the browser would let a draft override core settings.
    const config = appearanceChrome(
      themeNeutral(current.site, current.draft.config),
      submitted,
    )
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
    const config = themeNeutral(current.site, current.draft.config)
    const active = { revision: current.draft.revision + 1, config }
    await write(options, appearanceKeys.previous, current.active)
    await write(options, appearanceKeys.active, active)
    await write(options, appearanceKeys.draft, active)
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
    const config = themeNeutral(current.site, current.previous.config)
    const active = { revision: current.draft.revision + 1, config }
    await write(options, appearanceKeys.previous, current.active)
    await write(options, appearanceKeys.active, active)
    await write(options, appearanceKeys.draft, active)
    return active
  })
}

// Call inside the settings transaction before writing key "site". The shared lock
// keeps this atomic with draft/apply, and the bumped revision rejects stale tabs.
// Only the envelope copies are rewritten here; the core "site" option stays the
// authority that the settings transaction writes last.
export async function syncAppearanceSiteSettings(
  tx: AppearanceTransaction,
  site: SiteSettings,
  options: OptionsApi,
  keys?: (keyof SiteSettings)[],
) {
  await lockAppearance(tx)
  const stored = await options.getOptions([appearanceKeys.active, appearanceKeys.draft])
  const updatedSite = appearanceSite(site)
  const changedKeys = (keys ?? (Object.keys(updatedSite) as (keyof typeof updatedSite)[])).filter(
    (key): key is keyof typeof updatedSite => key in updatedSite,
  )
  const homeChanged =
    !keys ||
    keys.some((key) => key === 'showOnFront' || key === 'pageOnFront' || key === 'postsPerPage')
  for (const [key, value] of [
    [appearanceKeys.active, stored.get(appearanceKeys.active)],
    [appearanceKeys.draft, stored.get(appearanceKeys.draft)],
  ] as const) {
    if (!value) continue
    const envelope = parseEnvelope(value)
    if (!envelope) continue
    const config = envelope.config
    const copy = changedKeys.some(
      (field) => JSON.stringify(config.site[field]) !== JSON.stringify(updatedSite[field]),
    )
    const home =
      homeChanged &&
      (config.home.mode !== site.showOnFront ||
        config.home.pageId !== site.pageOnFront ||
        config.home.sections.some(
          (section) => section.type === 'latest' && section.limit !== site.postsPerPage,
        ))
    if (!copy && !home) continue
    await write(options, key, {
      revision: envelope.revision + 1,
      config: {
        ...config,
        ...(copy && {
          site: {
            ...config.site,
            ...Object.fromEntries(changedKeys.map((field) => [field, updatedSite[field]])),
          },
        }),
        ...(home && {
          home: {
            ...config.home,
            mode: site.showOnFront,
            pageId: site.pageOnFront,
            sections: config.home.sections.map((section) =>
              section.type === 'latest' ? { ...section, limit: site.postsPerPage } : section,
            ),
          },
        }),
      },
    })
  }
}

// The appearance draft belongs to the active theme's chrome, not to a package
// capability: identity, menu, footer, and social data live in the core "site"
// option, which every theme reads. A theme switch is still a reason to reject.
async function guardAppearanceTheme(tx: AppearanceTransaction, options: OptionsApi) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
  const theme = await getActiveTheme()
  const activeId = await options.getOption('active_theme')
  if (typeof activeId === 'string' && normalizeThemeId(activeId) !== theme.manifest.id)
    throw new AppearanceValidationError(
      'Tema aktif sudah berubah. Muat ulang editor sebelum menerapkan rancangan.',
    )
}
