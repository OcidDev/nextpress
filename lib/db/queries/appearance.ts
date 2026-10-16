import 'server-only'
import {
  appearanceEnvelopeSchema,
  defaultAppearance,
  type Appearance,
  type AppearanceEnvelope,
} from '@/lib/content/appearance'
import { defaultSettings, settingsSchema } from '@/lib/content/settings'
import { hasDatabase } from '@/lib/db'
import { getRequestOptions } from '@/lib/core/options-server'
import type { OptionsApi } from '@/lib/core/options'

/**
 * Kunci opsi tempat konfigurasi tampilan disimpan. `draft` dan `previous` hanya
 * tersisa sebagai sisa data instalasi lama; `active` yang dibaca situs.
 */
export const appearanceKeys = {
  draft: 'appearance:draft',
  active: 'appearance:active',
  previous: 'appearance:previous',
} as const

function parseEnvelope(value: unknown): AppearanceEnvelope | undefined {
  const parsed = appearanceEnvelopeSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

async function activeAppearance(options: OptionsApi): Promise<Appearance> {
  const values = await options.getOptions(['site', appearanceKeys.active])
  const parsedSite = settingsSchema.safeParse(values.get('site'))
  const site = parsedSite.success ? parsedSite.data : defaultSettings()
  return parseEnvelope(values.get(appearanceKeys.active))?.config ?? defaultAppearance(site)
}

/**
 * Konfigurasi tampilan situs.
 *
 * Nilai tersimpan selalu setara bawaan karena editor tampilan tidak lagi
 * disertakan, tetapi pembacaannya tetap satu jalur agar kartu artikel, bilah
 * sisi, dan laman statis tidak perlu bercabang.
 */
export async function getAppearance(): Promise<Appearance> {
  if (!hasDatabase()) return defaultAppearance()
  return activeAppearance(getRequestOptions())
}
