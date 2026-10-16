import { settingsSchema, defaultSettings } from '@/lib/content/settings'
import { appearanceEnvelopeSchema } from '@/lib/content/appearance'
import { extensionHealthSchema } from '@/lib/extensions/health'
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
  return registry
}
