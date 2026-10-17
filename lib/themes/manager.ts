import 'server-only'
import { cache } from 'react'
import { and, desc, eq, sql } from 'drizzle-orm'
import { requireCapability } from '@/lib/admin'
import type { OptionsApi } from '@/lib/core/options'
import { getRequestOptions, withOptionsTransaction } from '@/lib/core/options-server'
import { getDb, hasDatabase } from '@/lib/db'
import { options, pages } from '@/lib/db/schema'
import { themePackages } from '@/lib/db/theme-schema'
import bundledFiles from './bundled.generated.json'
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

export class ThemeDeletionError extends Error {}

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
    return await getDb().select().from(themePackages).orderBy(desc(themePackages.installedAt))
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
    const current = await options.getOption('active_theme')
    if (typeof current === 'string' && normalizeThemeId(current) !== theme.manifest.id)
      await options.updateOption('previous_theme', normalizeThemeId(current))
    await options.updateOption('active_theme', theme.manifest.id)
  })
}
export async function listInstalledThemes(): Promise<InstalledTheme[]> {
  const active = await getActiveTheme()
  const ids = new Set([
    ...bundled.map((p) => p.manifest.id),
    ...(await installedPackages()).map((p) => p.id),
  ])
  const themes: InstalledTheme[] = []
  for (const id of ids) {
    try {
      const theme = await getThemePackage(id)
      if (!theme) continue
      themes.push({
        ...theme.manifest,
        hash: theme.hash,
        screenshotUrl: theme.files['screenshot.png']
          ? themeAssetUrl(id, theme.hash, 'screenshot.png')
          : '/images/placeholder.webp',
        isActive: id === active.manifest.id,
        isDefault: id === DEFAULT_THEME_ID,
        supportsCustomizer: !!theme.customization,
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
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
      await tx
        .insert(themePackages)
        .values({ id: theme.manifest.id, hash: theme.hash, files: theme.files })
        .onConflictDoNothing()
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

const pageTemplatePrefix = (themeId: string) => `theme:${themeId}:`

/**
 * Delete an installed theme package.
 *
 * Mirrors the activation/install path: capability, id format, revision hash, and
 * the same advisory lock, all re-checked on the server. Bundled themes and the
 * active theme never leave through here, and pages still pointing at one of the
 * package's page templates block deletion instead of silently falling back.
 */
export async function deleteThemePackage(themeId: string, hash: string): Promise<void> {
  await requireCapability('delete_themes')
  if (!hasDatabase()) throw new Error('Database belum dikonfigurasi.')
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(themeId) || !/^[0-9a-f]{64}$/.test(hash))
    throw new ThemeDeletionError('Permintaan hapus tema tidak valid.')
  if (themeId === DEFAULT_THEME_ID)
    throw new ThemeDeletionError('Tema pemulihan bawaan tidak dapat dihapus.')
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
    const [row] = await tx.select().from(themePackages).where(eq(themePackages.id, themeId)).for('update')
    if (!row) throw new ThemeDeletionError('Tema tidak ditemukan atau sudah dihapus.')
    if (row.hash !== hash)
      throw new ThemeDeletionError(
        'Tema telah berubah sejak halaman dimuat. Muat ulang halaman dan coba lagi.',
      )
    const [storedActive] = await tx
      .select({ value: options.value })
      .from(options)
      .where(eq(options.name, 'active_theme'))
    const activeId = typeof storedActive?.value === 'string' ? storedActive.value.trim() : ''
    const storedActiveTheme = activeId ? normalizeThemeId(activeId) === themeId : false
    if (storedActiveTheme) {
      // A package that no longer validates is not serving the site: the reader
      // already falls back to the bundled theme. Deleting it must reset the
      // pointer instead of being blocked by a choice the site cannot render.
      let healthy = false
      try {
        healthy = validateThemePackage(row.files).manifest.id === themeId
      } catch {
        healthy = false
      }
      if (healthy)
        throw new ThemeDeletionError(
          'Tema yang sedang aktif tidak dapat dihapus. Aktifkan tema lain terlebih dahulu.',
        )
    }
    const inUse = await tx
      .select({ id: pages.id, title: pages.title, status: pages.status })
      .from(pages)
      .where(sql`${pages.pageTemplate} like ${pageTemplatePrefix(themeId) + '%'}`)
    // Trash still counts: restoring it would otherwise silently drop the layout.
    const blocking = inUse
    if (blocking.length) {
      const labels = { draft: 'draf', published: 'terbit', trash: 'Sampah' } as const
      const names = blocking
        .slice(0, 5)
        .map((page) => `"${page.title}" (${labels[page.status as keyof typeof labels] ?? page.status})`)
        .join(', ')
      throw new ThemeDeletionError(
        `Tema masih dipakai template halaman: ${names}${blocking.length > 5 ? ` dan ${blocking.length - 5} halaman lain` : ''}. Pilih template lain pada halaman tersebut sebelum menghapus tema.`,
      )
    }
    const deleted = await tx
      .delete(themePackages)
      .where(and(eq(themePackages.id, themeId), eq(themePackages.hash, hash)))
      .returning({ id: themePackages.id })
    if (!deleted.length) throw new ThemeDeletionError('Tema tidak ditemukan atau sudah dihapus.')
    // Site data lives in the core "site" option, so only the package's own
    // customization record is removed. Pages, menus, and appearance revisions stay.
    await tx.delete(options).where(eq(options.name, `theme:${themeId}:customization`))
    if (storedActiveTheme)
      await tx
        .update(options)
        .set({ value: DEFAULT_THEME_ID, updatedAt: new Date() })
        .where(eq(options.name, 'active_theme'))
  })
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
