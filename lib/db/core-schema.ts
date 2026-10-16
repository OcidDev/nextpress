import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'
import type { JsonValue } from '@/lib/core/options'
import { user } from './auth-schema'

export const options = pgTable(
  'cms_options',
  {
    name: varchar('name', { length: 191 }).primaryKey(),
    value: jsonb('value').$type<JsonValue>().notNull(),
    autoload: boolean('autoload').notNull().default(false),
    /** Transactional projection to cms_settings while legacy readers remain. */
    legacy: boolean('legacy').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cms_options_autoload_idx')
      .on(t.name)
      .where(sql`${t.autoload} = true`),
    check('cms_options_name_check', sql`${t.name} ~ '^[a-zA-Z0-9_.:-]+$'`),
    check('cms_options_size_check', sql`octet_length(${t.value}::text) <= 1048576`),
    check(
      'cms_options_autoload_size_check',
      sql`not ${t.autoload} or octet_length(${t.value}::text) <= 65536`,
    ),
  ],
)

export const transients = pgTable(
  'cms_transients',
  {
    name: varchar('name', { length: 191 }).primaryKey(),
    value: jsonb('value').$type<JsonValue>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('cms_transients_expiry_idx').on(t.expiresAt),
    check('cms_transients_size_check', sql`octet_length(${t.value}::text) <= 1048576`),
  ],
)

/** Additive and empty in S1; posts/pages stay authoritative until WP-05. */
export const content = pgTable(
  'cms_content',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    type: varchar('type', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    parentId: varchar('parent_id', { length: 32 }).references((): AnyPgColumn => content.id, {
      onDelete: 'restrict',
    }),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    /** Preserves legacy attribution even when no auth account exists. WP-05 maps it. */
    legacyAuthorId: varchar('legacy_author_id', { length: 32 }),
    slug: varchar('slug', { length: 200 }).notNull().default(''),
    title: text('title').notNull().default(''),
    content: text('content').notNull().default(''),
    format: varchar('format', { length: 16 }).notNull().default('html'),
    excerpt: text('excerpt').notNull().default(''),
    visibility: varchar('visibility', { length: 16 }).notNull().default('public'),
    passwordHash: text('password_hash'),
    commentStatus: varchar('comment_status', { length: 16 }).notNull().default('open'),
    mimeType: varchar('mime_type', { length: 120 }),
    menuOrder: integer('menu_order').notNull().default(0),
    guid: text('guid'),
    revision: integer('revision').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cms_content_type_status_date_idx').on(t.type, t.status, t.publishedAt.desc(), t.id),
    index('cms_content_parent_idx').on(t.parentId),
    index('cms_content_author_idx').on(t.authorId),
    index('cms_content_slug_idx').on(t.type, t.slug),
    check('cms_content_revision_check', sql`${t.revision} >= 1`),
    check('cms_content_format_check', sql`${t.format} in ('html', 'blocks')`),
    check(
      'cms_content_visibility_check',
      sql`${t.visibility} in ('public', 'private', 'password')`,
    ),
    check('cms_content_comment_status_check', sql`${t.commentStatus} in ('open', 'closed')`),
    check('cms_content_parent_check', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check(
      'cms_content_password_check',
      sql`${t.visibility} <> 'password' or ${t.passwordHash} is not null`,
    ),
  ],
)
