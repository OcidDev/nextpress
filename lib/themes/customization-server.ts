import 'server-only'
import { getRequestOptions, withOptionsTransaction } from '@/lib/core/options-server'
import { hasDatabase } from '@/lib/db'
import { desc, eq, sql } from 'drizzle-orm'
import { themePackages } from '@/lib/db/theme-schema'
import { getActiveThemeId, getThemePackage, normalizeThemeId } from './manager'
import {
  emptyCustomizationState,
  themeCustomizationStateSchema,
  validateThemeValues,
} from './customization'
import { requireCapability } from '@/lib/admin'

const key = (id: string) => `theme:${normalizeThemeId(id)}:customization`
export async function getThemeCustomizationState(id: string) {
  const value = hasDatabase() ? await getRequestOptions().getOption(key(id)) : null
  return value == null ? emptyCustomizationState() : themeCustomizationStateSchema.parse(value)
}
export async function changeThemeCustomization(input: {
  activeThemeId?: string
  themeId: string
  hash: string
  revision: number
  operation: 'save' | 'apply' | 'discard'
  values?: unknown
}) {
  await requireCapability('edit_theme_options')
  const theme = await getThemePackage(input.themeId)
  const activeAtStart = await getActiveThemeId()
  if (
    !theme ||
    (input.activeThemeId && input.activeThemeId !== activeAtStart) ||
    theme.manifest.id !== input.themeId ||
    theme.hash !== input.hash ||
    !theme.customization
  )
    throw new Error('Tema sudah berubah. Muat ulang halaman sebelum menyimpan.')
  const values =
    input.operation === 'save' ? validateThemeValues(theme.customization, input.values) : undefined
  return withOptionsTransaction(async (tx, options) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
    const [installed] = await tx
      .select({ hash: themePackages.hash })
      .from(themePackages)
      .where(eq(themePackages.id, input.themeId))
      .orderBy(desc(themePackages.installedAt))
      .limit(1)
    if (installed && installed.hash !== input.hash)
      throw new Error('Paket tema sudah diperbarui. Muat ulang halaman sebelum menyimpan.')
    const activeId = await options.getOption('active_theme')
    if (typeof activeId === 'string' && normalizeThemeId(activeId) !== activeAtStart)
      throw new Error('Tema aktif sudah berubah. Muat ulang halaman.')
    const stored = await options.getOption(key(input.themeId))
    const state =
      stored == null ? emptyCustomizationState() : themeCustomizationStateSchema.parse(stored)
    if (state.revision !== input.revision)
      throw new Error(
        'Pengaturan telah berubah di tab lain. Muat ulang agar perubahan tidak tertimpa.',
      )
    if (input.operation === 'save') state.draft = values!
    if (input.operation === 'apply') {
      if (activeAtStart !== input.themeId)
        throw new Error('Aktifkan tema sebelum menerapkan rancangan ke situs.')
      if (state.draft === null) throw new Error('Simpan rancangan sebelum menerapkannya.')
      state.active = validateThemeValues(theme.customization!, state.draft)
      state.draft = null
    }
    if (input.operation === 'discard') state.draft = null
    state.revision++
    await options.updateOption(key(input.themeId), state)
    return state
  })
}
