import { index, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'
import type { ThemeFiles } from '@/lib/themes/package'

export const themePackages = pgTable(
  'cms_theme_packages',
  {
    id: varchar('id', { length: 64 }).notNull(),
    hash: varchar('hash', { length: 64 }).primaryKey(),
    files: jsonb('files').$type<ThemeFiles>().notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('cms_theme_packages_id_idx').on(table.id, table.installedAt)],
)
