import { boolean, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { user } from './auth-schema'
import type { PluginConfig, PluginManifest } from '@/lib/plugins/manifest'

export const plugins = pgTable('cms_plugins', {
  id: varchar('id', { length: 64 }).primaryKey(),
  manifest: jsonb('manifest').$type<PluginManifest>().notNull(),
  files: jsonb('files').$type<Record<string, string>>().notNull(),
  packageHash: varchar('package_hash', { length: 64 }).notNull(),
  config: jsonb('config').$type<PluginConfig>().notNull(),
  enabled: boolean('enabled').notNull().default(false),
  revision: integer('revision').notNull().default(1),
  uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
  installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
