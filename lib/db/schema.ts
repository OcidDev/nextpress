import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
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
import type { AuthorSocial, SEO } from '@/types'
import { user } from './auth-schema'

/**
 * One row per requested application update. A job is the durable record an
 * operator polls: provider deployment states are transient, and a serverless
 * function cannot keep an in-memory progress object between requests.
 */
export const updateJobs = pgTable(
  'update_jobs',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    fromVersion: varchar('from_version', { length: 32 }).notNull(),
    toVersion: varchar('to_version', { length: 32 }).notNull(),
    tag: varchar('tag', { length: 64 }).notNull(),
    commit: varchar('commit', { length: 40 }).notNull(),
    /** "vercel" today; the adapter name that owns the job. */
    adapter: varchar('adapter', { length: 32 }).notNull(),
    /**
     * queued → deploying → ready | failed. `deploying` means the provider has
     * accepted the deployment; "ready" requires the running version to match.
     */
    status: varchar('status', { length: 16 }).notNull().default('queued'),
    /** Provider deployment id, never a user-supplied URL. */
    externalId: varchar('external_id', { length: 128 }),
    externalUrl: text('external_url'),
    detail: text('detail'),
    /** Migration list the release expects; recorded for the operator's log. */
    migrations: jsonb('migrations').$type<{ count: number; upto: string | null }>(),
    startedBy: text('started_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('update_jobs_created_at_idx').on(table.createdAt),
    // At most one unfinished job, enforced by the database rather than a
    // read-then-write check two concurrent clicks could both pass.
    uniqueIndex('update_jobs_single_active_idx')
      .on(sql`((true))`)
      .where(sql`${table.status} in ('queued', 'deploying')`),
  ],
)

/**
 * Barrel skema. Tabel inti, konten, plugin, dan tema diekspor ulang di bawah
 * sehingga `drizzle-kit generate` cukup menunjuk satu berkas ini.
 * Kolom memakai snake_case, field TypeScript camelCase.
 */

/** `tsvector` belum punya tipe bawaan di Drizzle; didaftarkan manual. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const authors = pgTable(
  'authors',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    slug: varchar('slug', { length: 160 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    avatar: text('avatar'),
    bio: text('bio'),
    role: varchar('role', { length: 80 }),
    social: jsonb('social').$type<AuthorSocial>(),
    verified: boolean('verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('authors_slug_idx').on(t.slug), uniqueIndex('authors_user_idx').on(t.userId)],
)

export const categories = pgTable(
  'categories',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    parentId: varchar('parent_id', { length: 32 }).references((): AnyPgColumn => categories.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_slug_idx').on(t.slug),
    index('categories_parent_idx').on(t.parentId),
    check(
      'categories_parent_not_self_check',
      sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`,
    ),
  ],
)

export const posts = pgTable(
  'posts',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull().default(''),
    content: text('content').notNull().default(''),

    featuredImage: text('featured_image'),
    featuredImageAlt: text('featured_image_alt'),
    isYoutube: boolean('is_youtube').notNull().default(false),

    authorId: varchar('author_id', { length: 32 })
      .notNull()
      .references(() => authors.id, { onDelete: 'restrict' }),

    // Menggantikan label ajaib Blogger dengan field eksplisit.
    isSponsored: boolean('is_sponsored').notNull().default(false),
    isProduct: boolean('is_product').notNull().default(false),
    layout: varchar('layout', { length: 16 }).notNull().default('default'),
    allowComments: boolean('allow_comments').notNull().default(true),
    showAds: boolean('show_ads').notNull().default(true),

    readingTime: integer('reading_time').notNull().default(0),
    wordCount: integer('word_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),

    status: varchar('status', { length: 16 }).notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    /** /YYYY/MM/judul.html — dipertahankan agar peta redirect bisa dibuat nanti. */
    legacyPath: text('legacy_path'),

    seo: jsonb('seo').$type<SEO>(),

    /**
     * Dibangun dari title + excerpt. Pengganti pencarian Blogger.
     * Bobot A untuk judul, B untuk ringkasan.
     */
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B')`,
    ),
  },
  (t) => [
    uniqueIndex('posts_slug_idx').on(t.slug),
    index('posts_status_published_idx').on(t.status, t.publishedAt.desc()),
    index('posts_views_idx')
      .on(t.viewCount.desc())
      .where(sql`status = 'published'`),
    index('posts_search_idx').using('gin', t.searchVector),
    index('posts_legacy_path_idx').on(t.legacyPath),
  ],
)

export const postCategories = pgTable(
  'post_categories',
  {
    postId: varchar('post_id', { length: 32 })
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    categoryId: varchar('category_id', { length: 32 })
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.categoryId] }),
    index('post_categories_category_idx').on(t.categoryId),
  ],
)

export const postTags = pgTable(
  'post_tags',
  {
    postId: varchar('post_id', { length: 32 })
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 120 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tag] }), index('post_tags_tag_idx').on(t.tag)],
)

export const comments = pgTable(
  'comments',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    postId: varchar('post_id', { length: 32 })
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    /** Balasan berjenjang; self-reference, maksimal 3 tingkat dijaga di Server Action. */
    parentId: varchar('parent_id', { length: 32 }).references((): AnyPgColumn => comments.id, {
      onDelete: 'cascade',
    }),

    authorName: varchar('author_name', { length: 120 }).notNull(),
    /** Tidak pernah dikirim ke client — query publik memakai tipe `PublicComment`. */
    authorEmail: varchar('author_email', { length: 200 }).notNull(),
    authorWebsite: text('author_website'),

    content: text('content').notNull(),
    /** Default 'pending': moderasi aktif, pertahanan pertama terhadap spam. */
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    ipHash: varchar('ip_hash', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comments_post_status_idx').on(t.postId, t.status, t.createdAt),
    index('comments_parent_idx').on(t.parentId),
  ],
)

export const pages = pgTable(
  'pages',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    status: varchar('status', { length: 16 }).notNull().default('published'),
    seo: jsonb('seo').$type<SEO>(),
    parentId: varchar('parent_id', { length: 32 }).references((): AnyPgColumn => pages.id, {
      onDelete: 'restrict',
    }),
    menuOrder: integer('menu_order').notNull().default(0),
    pageTemplate: varchar('page_template', { length: 200 }).notNull().default('default'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pages_slug_idx').on(t.slug),
    check('pages_status_check', sql`${t.status} in ('draft', 'published', 'trash')`),
    index('pages_status_idx').on(t.status),
    index('pages_parent_order_idx').on(t.parentId, t.menuOrder),
    check('pages_parent_not_self', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
)

export type PageRow = typeof pages.$inferSelect

export { user, session, account, verification, rateLimit } from './auth-schema'
export { media, settings, commentLimits } from './operations-schema'
export { adminPreferences } from './preferences-schema'
export { plugins } from './plugin-schema'
export { viewDaily, viewBatches } from './views-schema'
export { options, transients, content } from './core-schema'
export {
  terms,
  termTaxonomy,
  termRelationships,
  contentMeta,
  userMeta,
  commentMeta,
  termMeta,
  legacyContentMap,
} from './data-schema'
export { themePackages } from './theme-schema'

export const contentRevisions = pgTable(
  'cms_editor_revisions',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    kind: varchar('kind', { length: 8 }).notNull(),
    contentId: varchar('content_id', { length: 32 }).notNull(),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    snapshot: jsonb('snapshot').$type<Record<string, string | string[]>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cms_editor_revisions_content_idx').on(t.kind, t.contentId, t.createdAt),
    check('cms_editor_revisions_kind_check', sql`${t.kind} in ('posts', 'pages')`),
  ],
)
