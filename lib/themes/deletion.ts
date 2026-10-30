import { desc, eq, sql } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import type { OptionsApi } from '@/lib/core/options'
import { pages } from '@/lib/db/schema'
import { themePackages } from '@/lib/db/theme-schema'
import { validateThemePackage, type ThemePackage } from './package'

export class ThemeDeletionError extends Error {}
export const themeRemovalKey = (id: string) => `theme:${id}:uninstalled`
const normalize = (id: string) => (id === 'twentytwentyfour' ? 'core-default' : id)

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

/** Called by the authorized CMS manager inside the shared theme lifecycle lock. */
export async function deleteThemeData(
  tx: Transaction,
  options: OptionsApi,
  themeId: string,
  hash: string,
  bundled: ThemePackage[],
) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(themeId) || !/^[0-9a-f]{64}$/.test(hash))
    throw new ThemeDeletionError('Permintaan hapus tema tidak valid.')
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
  const packages = await tx
    .select()
    .from(themePackages)
    .orderBy(desc(themePackages.installedAt), desc(themePackages.hash))
    .for('update')
  const latest = packages.find((row) => row.id === themeId)
  const builtin = bundled.find((theme) => theme.manifest.id === themeId)
  const removed = (await options.getOption(themeRemovalKey(themeId))) === true
  if (removed || (!latest && !builtin))
    throw new ThemeDeletionError('Tema tidak ditemukan atau sudah dihapus.')
  if ((latest?.hash ?? builtin?.hash) !== hash)
    throw new ThemeDeletionError(
      'Tema telah berubah sejak halaman dimuat. Muat ulang halaman dan coba lagi.',
    )

  const active = await options.getOption('active_theme')
  const previous = await options.getOption('previous_theme')
  const activeId = typeof active === 'string' ? normalize(active.trim()) : 'core-default'
  // Protect the theme actually serving the site, including a previous-theme fallback.
  let serving = 'core-default'
  for (const id of [activeId, typeof previous === 'string' ? normalize(previous) : '']) {
    if (!id || (await options.getOption(themeRemovalKey(id))) === true) continue
    const row = packages.find((item) => item.id === id)
    try {
      const theme = row
        ? validateThemePackage(row.files)
        : bundled.find((item) => item.manifest.id === id)
      if (theme && theme.manifest.id === id && (!row || row.hash === theme.hash)) {
        serving = id
        break
      }
    } catch {
      /* Continue to the next recovery candidate. */
    }
  }
  if (themeId === serving)
    throw new ThemeDeletionError(
      'Tema yang sedang aktif tidak dapat dihapus. Aktifkan tema lain terlebih dahulu.',
    )
  const inUse = await tx
    .select({ id: pages.id, title: pages.title })
    .from(pages)
    .where(sql`${pages.pageTemplate} like ${`theme:${themeId}:%`}`)
  if (inUse.length) {
    const names = inUse
      .slice(0, 5)
      .map((page) => `"${page.title}"`)
      .join(', ')
    throw new ThemeDeletionError(
      `Tema masih dipakai template halaman: ${names}${inUse.length > 5 ? ` dan ${inUse.length - 5} halaman lain` : ''}. Pilih template lain pada halaman tersebut sebelum menghapus tema.`,
    )
  }
  // Uninstall all immutable revisions, otherwise an older package reappears.
  await tx.delete(themePackages).where(eq(themePackages.id, themeId))
  await options.deleteOption(`theme:${themeId}:customization`)
  await options.updateOption(themeRemovalKey(themeId), true)
  if (typeof previous === 'string' && normalize(previous) === themeId)
    await options.deleteOption('previous_theme')
  if (activeId === themeId) await options.updateOption('active_theme', serving)
}
