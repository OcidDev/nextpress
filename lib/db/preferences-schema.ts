import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { AdminPreferences } from '@/lib/content/admin-preferences'
import { user } from './auth-schema'

export const adminPreferences = pgTable('cms_admin_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  value: jsonb('value').$type<AdminPreferences>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
