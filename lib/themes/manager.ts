import { claimLegacyAppearance } from './layout-storage'
import 'server-only'
import { cache } from 'react'
import { desc, eq, sql } from 'drizzle-orm'
import { requireCapability } from '@/lib/admin'
import type { OptionsApi } from '@/lib/core/options'
import { getRequestOptions, withOptionsTransaction } from '@/lib/core/options-server'
import { getDb, hasDatabase } from '@/lib/db'
import { options } from '@/lib/db/schema'
import { themePackages } from '@/lib/db/theme-schema'
import bundledFiles from './bundled.generated.json'
import { deleteThemeData, themeRemovalKey } from './deletion'
export { ThemeDeletionError } from './deletion'
import {
  readThemeZip,
  validateThemePackage,
  themeAssetUrl,
  type ThemePackage,
  type ThemeFiles,
} from './package'

export { themeManifestSchema, type ThemeManifest } from './package'
export const DEFAULT_THEME_ID = 'core-default'
export const normalizeThemeId = (id: string) => (id === 'twentytwentyfour' ? DEFAULT_THEME_ID : id)
const bundled = Object.values(bundledFiles).map((files) =>
  validateThemePackage(files as ThemeFiles),
)
export interface InstalledTheme {
  id: string
  /** Package revision, so a delete request is tied to the row the admin saw. */
  hash: string
  name: string
  version: string
  author: string
  description: string
  screenshotUrl: string
  isActive: boolean
  isDefault: boolean
  supportsCustomizer: boolean
  /** Set when the stored package no longer validates; it can only be deleted. */
  broken?: boolean
}

export const getActiveThemeId = cache(async (): Promise<string> => {
  if (!hasDatabase()) return DEFAULT_THEME_ID
  const options = getRequestOptions()
  const active = await options.getOption('active_theme')
  // Without a stored choice the default theme is the only design that ships.
  // Public reads must not create options, so this stays a plain fallback.
  return typeof active === 'string' && active.trim()
    ? normalizeThemeId(active.trim())
    : DEFAULT_THEME_ID
})

/** Pin the current implicit choice before a write can make a fresh site look legacy. */
export async function initializeActiveTheme(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  options: OptionsApi,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
  const active = await options.getOption('active_theme')
  if (typeof active === 'string' && active.trim()) return
  await options.updateOption('active_theme', DEFAULT_THEME_ID)
}

function missingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (
    ('code' in error && error.code === '42P01') || ('cause' in error && missingTable(error.cause))
  )
}
const installedPackages = cache(async () => {
  if (!hasDatabase()) return []
  try {
    return await getDb()
      .select()
      .from(themePackages)
      .orderBy(desc(themePackages.installedAt), desc(themePackages.hash))
  } catch (error) {
    // Built-in packages must still render during a rolling deployment before the
    // theme package table exists.
    if (missingTable(error)) return []
    throw error
  }
})
export const getThemePackage = cache(
  async (themeId: string, hash?: string): Promise<ThemePackage | undefined> => {
    const id = normalizeThemeId(themeId)
    if (
      !hash &&
      hasDatabase() &&
      (await getRequestOptions().getOption(themeRemovalKey(id))) === true
    )
      return undefined
    const row = (await installedPackages()).find(
      (row) => row.id === id && (!hash || row.hash === hash),
    )
    if (row) {
      let parsed: ThemePackage
      try {
        parsed = validateThemePackage(row.files)
      } catch {
        throw new Error('Paket tema tersimpan gagal divalidasi.')
      }
      if (parsed.manifest.id !== id || parsed.hash !== row.hash)
        throw new Error('Integritas paket tema tidak valid.')
      return parsed
    }
    return bundled.find((theme) => theme.manifest.id === id && (!hash || theme.hash === hash))
  },
)
export const getActiveTheme = cache(async (): Promise<ThemePackage> => {
  const activeId = await getActiveThemeId()
  try {
    const active = await getThemePackage(activeId)
    if (active) return active
    console.error('[themes] Paket aktif tidak tersedia:', activeId)
  } catch (error) {
    // Do not turn database outages into a seemingly successful theme switch.
    if (
      !(error instanceof Error) ||
      !/paket|template|tema|CSS|Part|berkas|index/i.test(error.message)
    )
      throw error
    console.error('[themes] Paket aktif gagal divalidasi:', activeId)
  }
  const previous = hasDatabase() ? await getRequestOptions().getOption('previous_theme') : null
  if (typeof previous === 'string' && normalizeThemeId(previous) !== activeId) {
    try {
      const healthy = await getThemePackage(previous)
      if (healthy) return healthy
    } catch {
      /* recovery continues to bundled default */
    }
  }
  return bundled.find((theme) => theme.manifest.id === DEFAULT_THEME_ID)!
})
export async function setActiveThemeId(themeId: string): Promise<void> {
  await requireCapability('switch_themes')
  if (!hasDatabase()) throw new Error('Database belum dikonfigurasi.')
  const theme = await getThemePackage(themeId)
  if (!theme) throw new Error('Tema belum terpasang atau paketnya tidak tersedia.')
  await withOptionsTransaction(async (tx, options) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
    if ((await options.getOption(themeRemovalKey(theme.manifest.id))) === true)
      throw new Error('Tema sudah dihapus. Muat ulang daftar tema.')
    const [latest] = await tx
      .select({ hash: themePackages.hash })
      .from(themePackages)
      .where(eq(themePackages.id, theme.manifest.id))
      .orderBy(desc(themePackages.installedAt), desc(themePackages.hash))
      .limit(1)
    if (latest && latest.hash !== theme.hash)
      throw new Error('Paket tema sudah diperbarui. Muat ulang daftar tema.')
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
    await claimLegacyAppearance(options)
    const current = await options.getOption('active_theme')
    if (typeof current === 'string' && normalizeThemeId(current) !== theme.manifest.id)
      await options.updateOption('previous_theme', normalizeThemeId(current))
    await options.updateOption('active_theme', theme.manifest.id)
  })
}
export async function listInstalledThemes(): Promise<InstalledTheme[]> {
  const active = await getActiveTheme()
  const ids = new Set([
    active.manifest.id,
    ...bundled.map((p) => p.manifest.id),
    ...(await installedPackages()).map((p) => p.id),
  ])
  const themes: InstalledTheme[] = []
  for (const id of ids) {
    try {
      const theme = id === active.manifest.id ? active : await getThemePackage(id)
      if (!theme) continue
      themes.push({
        ...theme.manifest,
        hash: theme.hash,
        screenshotUrl: theme.files['screenshot.png']
          ? themeAssetUrl(id, theme.hash, 'screenshot.png')
          : '/images/placeholder.webp',
        isActive: id === active.manifest.id,
        isDefault: id === DEFAULT_THEME_ID,
        supportsCustomizer: true,
      })
    } catch {
      // A broken package must stay visible so it can be deleted. Hiding it would
      // leave the row stuck in the database with no admin path out.
      console.error('[themes] Paket galeri tidak valid:', id)
      const row = (await installedPackages()).find((entry) => entry.id === id)
      if (row)
        themes.push({
          id,
          hash: row.hash,
          name: id,
          version: '?',
          author: '',
          description:
            'Paket tema tersimpan gagal divalidasi. Hapus tema ini setelah memastikan tidak ada halaman yang memakainya.',
          screenshotUrl: '/images/placeholder.webp',
          isActive: id === active.manifest.id,
          isDefault: id === DEFAULT_THEME_ID,
          supportsCustomizer: false,
          broken: true,
        })
    }
  }
  return themes.sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      Number(b.isDefault) - Number(a.isDefault) ||
      a.name.localeCompare(b.name),
  )
}
export async function installThemeFromZip(buffer: Buffer): Promise<{ id: string; name: string }> {
  await requireCapability('install_themes')
  if (!hasDatabase()) throw new Error('Database belum dikonfigurasi.')
  const theme = await readThemeZip(buffer)
  if (theme.manifest.id === 'twentytwentyfour')
    throw new Error('Gunakan ID core-default untuk paket Twenty Twenty-Four.')
  try {
    // Immutable revisions keep old asset URLs valid after an update.
    await withOptionsTransaction(async (tx, optionApi) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
      await claimLegacyAppearance(optionApi)
      await tx
        .insert(themePackages)
        .values({ id: theme.manifest.id, hash: theme.hash, files: theme.files })
        .onConflictDoNothing()
      await tx.delete(options).where(eq(options.name, themeRemovalKey(theme.manifest.id)))
    })
  } catch (error) {
    if (missingTable(error))
      throw new Error(
        'Penyimpanan tema belum siap. Terapkan migrasi database (pnpm db:migrate) sebelum mengunggah tema.',
      )
    throw error
  }
  return { id: theme.manifest.id, name: theme.manifest.name }
}

/** Core lifecycle: themes and plugins never implement their own uninstall handler. */
export async function deleteThemePackage(themeId: string, hash: string): Promise<void> {
  await requireCapability('delete_themes')
  if (!hasDatabase()) throw new Error('Database belum dikonfigurasi.')
  await withOptionsTransaction(async (tx, options) => {
    await initializeActiveTheme(tx, options)
    await deleteThemeData(tx, options, themeId, hash, bundled)
  })
}

/** Keep internal recovery available to the editor preview after uninstalling its gallery entry. */
export async function getThemeForEditor(themeId: string) {
  const theme = await getThemePackage(themeId)
  if (theme) return theme
  const active = await getActiveTheme()
  return active.manifest.id === normalizeThemeId(themeId) ? active : undefined
}

export async function readThemeAsset(id: string, hash: string, name: string) {
  // Assets from immutable old revisions remain available, not just the active revision.
  const theme = await getThemePackage(id, hash)
  if (!theme || theme.manifest.id !== id) return null
  if (name === 'style.css') return { body: Buffer.from(theme.css), type: 'text/css; charset=utf-8' }
  if (name !== 'screenshot.png' && !name.startsWith('assets/')) return null
  const file = theme.files[name]
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    woff2: 'font/woff2',
  }
  const type = types[name.split('.').pop()!]
  return file && type ? { body: Buffer.from(file, 'base64'), type } : null
}
