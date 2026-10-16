import { pgTable, text, integer, timestamp, jsonb, customType } from 'drizzle-orm/pg-core'
import { user } from './auth-schema'
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})
export const media = pgTable('cms_media', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  alt: text('alt').notNull().default(''),
  title: text('title').notNull().default(''),
  caption: text('caption').notNull().default(''),
  description: text('description').notNull().default(''),
  data: bytea('data').notNull(),
  uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
export const settings = pgTable('cms_settings', {
  id: text('id').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
export const commentLimits = pgTable('cms_comment_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
})
