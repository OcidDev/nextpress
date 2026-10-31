import { appearanceEnvelopeSchema, type AppearanceEnvelope } from '@/lib/content/appearance'
import { settingsSchema, defaultSettings } from '@/lib/content/settings'
import type { OptionsApi } from '@/lib/core/options'
import type { ThemePackage } from './package'
import { layoutChrome, layoutChromeSchema, layoutDefaults, withSite } from './layout'
import { z } from 'zod'

export const legacyAppearanceKeys = {
  active: 'appearance:active',
  draft: 'appearance:draft',
  previous: 'appearance:previous',
} as const
export const themeAppearanceKeys = (id: string) => ({
  active: `theme:${id}:appearance:active`,
  draft: `theme:${id}:appearance:draft`,
  previous: `theme:${id}:appearance:previous`,
})
const envelopeSchema = z.object({
  revision: z.number().int().nonnegative(),
  config: layoutChromeSchema,
})
const normalize = (id: string) => (id === 'twentytwentyfour' ? 'core-default' : id)

/** Run under the theme lifecycle lock, before changing the active choice. Keep the legacy backup. */
export async function claimLegacyAppearance(options: OptionsApi) {
  if (await options.getOption('appearance:legacy-owner')) return
  const active = await options.getOption('active_theme')
  const id = typeof active === 'string' && active.trim() ? normalize(active.trim()) : 'core-default'
  const keys = themeAppearanceKeys(id)
  for (const state of ['active', 'draft', 'previous'] as const) {
    const old = appearanceEnvelopeSchema.safeParse(
      await options.getOption(legacyAppearanceKeys[state]),
    )
    if (old.success && !(await options.getOption(keys[state])))
      await writeLayoutEnvelope(options, keys[state], old.data)
  }
  await options.updateOption('appearance:legacy-owner', id)
}
export async function writeLayoutEnvelope(
  options: OptionsApi,
  key: string,
  value: AppearanceEnvelope,
) {
  await options.updateOption(
    key,
    envelopeSchema.parse({ revision: value.revision, config: layoutChrome(value.config) }),
  )
}
export async function readLayoutDocuments(options: OptionsApi, theme: ThemePackage) {
  const keys = themeAppearanceKeys(theme.manifest.id)
  const values = await options.getOptions([
    'site',
    'active_theme',
    'appearance:legacy-owner',
    ...Object.values(keys),
    ...Object.values(legacyAppearanceKeys),
  ])
  const parsedSite = settingsSchema.safeParse(values.get('site'))
  const site = parsedSite.success ? parsedSite.data : defaultSettings()
  const owner = values.get('appearance:legacy-owner')
  const activeId = values.get('active_theme')
  // Before the first lifecycle write, only the current theme may read old global revisions.
  const legacyOwner = owner ?? (typeof activeId === 'string' ? normalize(activeId) : 'core-default')
  function read(state: keyof typeof keys): AppearanceEnvelope | undefined {
    const parsed = envelopeSchema.safeParse(values.get(keys[state]))
    if (parsed.success)
      return { revision: parsed.data.revision, config: withSite(parsed.data.config, site) }
    if (!owner && legacyOwner === theme.manifest.id) {
      const old = appearanceEnvelopeSchema.safeParse(values.get(legacyAppearanceKeys[state]))
      if (old.success)
        return {
          revision: old.data.revision,
          config: withSite(layoutChrome(old.data.config), site),
        }
    }
    return undefined
  }
  const active = read('active') ?? { revision: 0, config: layoutDefaults(theme.layout, site) }
  return { keys, site, active, draft: read('draft') ?? active, previous: read('previous') }
}
