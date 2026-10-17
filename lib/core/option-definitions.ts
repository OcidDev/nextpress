import { settingsSchema, defaultSettings } from '@/lib/content/settings'
import { appearanceEnvelopeSchema } from '@/lib/content/appearance'
import { extensionHealthSchema } from '@/lib/extensions/health'
import { z } from 'zod'
import { releaseManifestSchema } from '@/lib/updates/manifest'
import { createOptionRegistry } from './options'

import { initialRoles, roleDefinitionsSchema } from './roles'

export function createCmsOptionRegistry() {
  const registry = createOptionRegistry()
  registry.register('core:roles', {
    schema: roleDefinitionsSchema,
    defaultValue: initialRoles,
    autoload: true,
  })
  registry.register('site', {
    schema: settingsSchema,
    defaultValue: defaultSettings,
    autoload: true,
    legacy: true,
  })
  for (const name of ['appearance:active', 'appearance:draft', 'appearance:previous'])
    registry.register(name, { schema: appearanceEnvelopeSchema, legacy: true })
  registry.register('extensions:health', { schema: extensionHealthSchema, legacy: true })
  // Last successful GitHub lookup. Stored so the update page can render instantly
  // and degrade to a "last checked" notice when the API is unreachable.
  registry.register('updates:check', {
    schema: z.object({
      checkedAt: z.string().datetime(),
      installed: z.string(),
      status: z.enum(['current', 'available']),
      version: z.string(),
      url: z.string(),
      // The validated manifest is cached with the answer so rendering the page
      // never re-hits GitHub; only an explicit check refreshes it.
      latest: releaseManifestSchema.nullable(),
    }),
    legacy: true,
  })
  return registry
}
