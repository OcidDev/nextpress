import { z } from 'zod'

export const dashboardPanelIds = [
  'welcome',
  'overview',
  'activity',
  'drafts',
  'moderation',
  'setup',
] as const

export type DashboardPanelId = (typeof dashboardPanelIds)[number]

export const adminPreferencesSchema = z
  .object({
    collapsed: z.boolean(),
    panels: z
      .array(z.enum(dashboardPanelIds))
      .max(dashboardPanelIds.length)
      .refine((panels) => new Set(panels).size === panels.length, 'Panel tidak boleh berulang'),
  })
  .strict()

export const adminPreferencesPatchSchema = adminPreferencesSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Pilih preferensi yang akan disimpan')

export type AdminPreferences = z.infer<typeof adminPreferencesSchema>

export function defaultAdminPreferences(): AdminPreferences {
  return { collapsed: false, panels: [...dashboardPanelIds] }
}
