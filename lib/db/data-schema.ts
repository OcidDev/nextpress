import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { content } from './core-schema'
import { user } from './auth-schema'
import { comments } from './schema'
import type { JsonValue } from '@/lib/core/options'

export const terms = pgTable(
  'cms_terms',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
  },
  (t) => [index('cms_terms_slug_idx').on(t.slug)],
)

export const termTaxonomy = pgTable(
  'cms_term_taxonomy',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    termId: varchar('term_id', { length: 32 })
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    taxonomy: varchar('taxonomy', { length: 32 }).notNull(),
    parentId: varchar('parent_id', { length: 32 }).references((): AnyPgColumn => termTaxonomy.id, {
      onDelete: 'restrict',
    }),
    description: text('description').notNull().default(''),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('cms_term_taxonomy_term_name_idx').on(t.termId, t.taxonomy),
    index('cms_term_taxonomy_name_idx').on(t.taxonomy),
    index('cms_term_taxonomy_parent_idx').on(t.parentId),
    check('cms_term_taxonomy_count_check', sql`${t.count} >= 0`),
    check('cms_term_taxonomy_parent_check', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
)

export const termRelationships = pgTable(
  'cms_term_relationships',
  {
    contentId: varchar('content_id', { length: 32 })
      .notNull()
      .references(() => content.id, { onDelete: 'cascade' }),
    termTaxonomyId: varchar('term_taxonomy_id', { length: 32 })
      .notNull()
      .references(() => termTaxonomy.id, { onDelete: 'cascade' }),
    order: integer('term_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.contentId, t.termTaxonomyId] }),
    index('cms_term_relationships_term_idx').on(t.termTaxonomyId),
    check('cms_term_relationships_order_check', sql`${t.order} >= 0`),
  ],
)

function metaTable(name: string, object: () => AnyPgColumn, textId = false) {
  return pgTable(
    name,
    {
      id: varchar('id', { length: 32 }).primaryKey(),
      objectId: (textId ? text('object_id') : varchar('object_id', { length: 32 }))
        .notNull()
        .references(object, { onDelete: 'cascade' }),
      key: varchar('meta_key', { length: 191 }).notNull(),
      value: jsonb('meta_value').$type<JsonValue>().notNull(),
    },
    (t) => [
      index(`${name}_object_key_idx`).on(t.objectId, t.key),
      check(`${name}_key_check`, sql`length(${t.key}) > 0`),
      check(`${name}_value_size_check`, sql`octet_length(${t.value}::text) <= 65536`),
    ],
  )
}
export const contentMeta = metaTable('cms_content_meta', () => content.id)
export const userMeta = metaTable('cms_user_meta', () => user.id, true)
export const commentMeta = metaTable('cms_comment_meta', () => comments.id)
export const termMeta = metaTable('cms_term_meta', () => terms.id)

// Shadow migration bookkeeping. Legacy sources stay intact until cutover;
// source-qualified lookup handles equal IDs in posts/pages/media safely.
export const legacyContentMap = pgTable(
  'cms_legacy_content_map',
  {
    source: varchar('source', { length: 16 }).notNull(),
    sourceId: text('source_id').notNull(),
    contentId: varchar('content_id', { length: 32 })
      .notNull()
      .references(() => content.id, { onDelete: 'cascade' }),
    sourceHash: varchar('source_hash', { length: 64 }).notNull(),
    targetHash: varchar('target_hash', { length: 64 }).notNull(),
    migratedAt: timestamp('migrated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.sourceId] }),
    uniqueIndex('cms_legacy_content_map_target_idx').on(t.contentId),
    check('cms_legacy_content_map_source_check', sql`${t.source} in ('post','page','media')`),
  ],
)
