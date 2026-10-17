import { initializeActiveTheme } from '@/lib/themes/manager'
import { lockContentStructure } from '@/lib/core/content-mapping'
import { rememberPostRoutes, validatePublicPermalinks } from '@/lib/content/permalink-server'
import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { getDb, hasDatabase } from '@/lib/db'
import { media, pages } from '@/lib/db/schema'
import { getRequestOptions, withOptionsTransaction } from '@/lib/core/options-server'
import { defaultSettings, settingsSchema, SettingsValidationError } from '@/lib/content/settings'
import { resolveDefaultCategory, lockCategoryStructure } from './taxonomy'
import { requireAdmin } from '@/lib/admin'
import { syncAppearanceSiteSettings } from './appearance'
type SettingsTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
async function validateLogo(tx: SettingsTransaction, logo: string) {
  const id = /(?:^|\/)api\/media\/([a-f0-9]{32})(?:[?#]|$)/.exec(logo)?.[1]
  if (!id) return
  const [found] = await tx.select({ id: media.id }).from(media).where(eq(media.id, id)).for('share')
  if (!found) throw new Error('Logo CMS sudah dihapus. Pilih gambar pengganti.')
}
export async function getSettings() {
  if (!hasDatabase()) return defaultSettings()
  return settingsSchema.parse(await getRequestOptions().getOption('site'))
}
export async function saveSettingsData(value: unknown) {
  await requireAdmin()
  const parsed = settingsSchema.parse(value)
  await withOptionsTransaction(async (tx, options) => {
    await initializeActiveTheme(tx, options)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
    await lockContentStructure(tx)
    const current = settingsSchema.parse(await options.getOption('site'))
    await rememberPostRoutes(tx, current)
    await validatePublicPermalinks(tx, parsed)
    await validateReading(tx, parsed)
    await validateDefaultCategory(tx, parsed)
    await validateLogo(tx, parsed.logo)
    await validateLogo(tx, parsed.icon)
    await syncAppearanceSiteSettings(tx, parsed, options)
    await options.updateOption('site', parsed)
  })
}

export const settingsSections = {
  general: [
    'name',
    'description',
    'logo',
    'icon',
    'siteUrl',
    'adminEmail',
    'usersCanRegister',
    'defaultRole',
    'timezone',
    'dateFormat',
    'timeFormat',
    'startOfWeek',
  ],
  writing: ['defaultCategory', 'defaultPostFormat', 'pingSites'],
  reading: [
    'defaultMode',
    'defaultTheme',
    'showOnFront',
    'pageOnFront',
    'pageForPosts',
    'postsPerPage',
    'postsPerRss',
    'rssUseExcerpt',
    'blogPublic',
  ],
  permalinks: ['permalinkStructure', 'categoryBase', 'tagBase'],
  menus: ['navigation', 'secondaryNavigation'],
  footer: ['footer'],
  social: ['social'],
  discussion: ['commentsEnabled'],
  integrations: ['gaId', 'adsenseId', 'viewsEnabled'],
} as const
export async function saveSettingsSectionData(
  section: keyof typeof settingsSections,
  value: unknown,
) {
  await requireAdmin()
  const keys = settingsSections[section]
  const mask = Object.fromEntries(keys.map((key) => [key, true])) as Partial<
    Record<keyof import('@/lib/content/settings').SiteSettings, true>
  >
  const patch = settingsSchema.pick(mask).strict().parse(value)
  await withOptionsTransaction(async (tx, options) => {
    await initializeActiveTheme(tx, options)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
    const current = settingsSchema.parse(await options.getOption('site'))
    const parsed = settingsSchema.parse({ ...current, ...patch })
    if (
      section === 'permalinks' ||
      (section === 'general' && current.timezone !== parsed.timezone)
    ) {
      await lockContentStructure(tx)
      await rememberPostRoutes(tx, current)
      await validatePublicPermalinks(tx, parsed)
    }
    if (section === 'reading') await validateReading(tx, parsed)
    if (section === 'writing') await validateDefaultCategory(tx, parsed)
    if (section === 'general') {
      await validateLogo(tx, parsed.logo)
      await validateLogo(tx, parsed.icon)
    }
    await syncAppearanceSiteSettings(tx, parsed, options, [...keys])
    await options.updateOption('site', parsed)
  })
}

async function validateDefaultCategory(
  tx: SettingsTransaction,
  settings: import('@/lib/content/settings').SiteSettings,
) {
  await lockCategoryStructure(tx)
  const resolved = await resolveDefaultCategory(settings.defaultCategory, tx)
  if (
    !resolved.id ||
    (settings.defaultCategory !== resolved.id && settings.defaultCategory !== resolved.slug)
  )
    throw new Error('Kategori pos baku tidak ditemukan. Pilih kategori yang tersedia.')
  settings.defaultCategory = resolved.id
}

async function validateReading(
  tx: SettingsTransaction,
  settings: import('@/lib/content/settings').SiteSettings,
) {
  if (settings.showOnFront !== 'page') return
  if (!settings.pageOnFront) throw new SettingsValidationError('Pilih laman untuk beranda statis.')
  if (settings.pageOnFront === settings.pageForPosts)
    throw new SettingsValidationError('Beranda dan laman pos harus berbeda.')
  for (const id of [settings.pageOnFront, settings.pageForPosts].filter(Boolean)) {
    const [page] = await tx
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.id, id), eq(pages.status, 'published')))
      .for('share')
    if (!page) throw new SettingsValidationError('Laman yang dipilih sudah tidak tersedia.')
  }
}
