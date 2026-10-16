import { AsyncLocalStorage } from 'node:async_hooks'
import { eq, inArray, sql } from 'drizzle-orm'
import type { CoreTransaction } from '@/lib/db/meta-store'
import { posts, pages, authors, categories, postCategories, postTags, media } from '@/lib/db/schema'
import { content } from '@/lib/db/core-schema'
import {
  contentMeta,
  terms,
  termTaxonomy,
  termRelationships,
  termMeta,
  legacyContentMap,
} from '@/lib/db/data-schema'
import type { JsonValue } from '@/lib/core/options'
import type { Post, SEO } from '@/types'
import { slugify } from '@/lib/utils'
import { stableId, categoryTaxId, tagId, tagTaxId, legacyMetaId } from './content-identity'
import {
  checkpointProjection,
  coreContentHash,
  getContentMapping,
  legacySourceRow,
  legacySourceHash,
  legacySourceMatches,
  lockContentStructure,
  projectionTarget,
} from './content-mapping'
export { sha, stableId, categoryTaxId, tagId, tagTaxId, legacyMetaId } from './content-identity'

const projectionScope = new AsyncLocalStorage<boolean>()

/**
 * Runs a function within a projection guard to prevent infinite loops
 * between legacy and core tables.
 */
async function withProjectionGuard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (projectionScope.getStore()) return undefined
  return projectionScope.run(true, fn)
}

/** Compatibility projection while legacy categories remain authoritative. */
export async function projectCategoryToCore(tx: CoreTransaction, id: string) {
  const ancestors: (typeof categories.$inferSelect)[] = []
  const visited = new Set<string>()
  let cursor: string | null = id
  while (cursor) {
    if (visited.has(cursor) || visited.size > 64) throw new Error('Hierarki kategori tidak valid.')
    visited.add(cursor)
    const [row]: (typeof categories.$inferSelect)[] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, cursor))
    if (!row) throw new Error('Kategori induk tidak ditemukan.')
    ancestors.push(row)
    cursor = row.parentId
  }
  for (const row of ancestors.reverse()) {
    const [existing] = await tx.select().from(terms).where(eq(terms.id, row.id))
    const [category] = await tx
      .select()
      .from(termTaxonomy)
      .where(eq(termTaxonomy.id, categoryTaxId(row.id)))
    if (existing && (!category || category.termId !== row.id || category.taxonomy !== 'category'))
      throw new Error(
        'Identitas kategori bertabrakan dengan term lain; rekonsiliasi mapping diperlukan.',
      )
    await tx
      .insert(terms)
      .values({ id: row.id, name: row.name, slug: row.slug })
      .onConflictDoUpdate({ target: terms.id, set: { name: row.name, slug: row.slug } })
    const values = {
      termId: row.id,
      taxonomy: 'category',
      parentId: row.parentId ? categoryTaxId(row.parentId) : null,
      description: row.description ?? '',
    }
    await tx
      .insert(termTaxonomy)
      .values({ id: categoryTaxId(row.id), ...values })
      .onConflictDoUpdate({ target: termTaxonomy.id, set: values })
  }
}

export async function removeCategoryProjection(tx: CoreTransaction, id: string) {
  await tx.delete(termTaxonomy).where(eq(termTaxonomy.id, categoryTaxId(id)))
  await tx.execute(
    sql`delete from cms_terms where id=${id} and not exists (select 1 from cms_term_taxonomy where term_id=${id})`,
  )
  await recountTaxonomies(tx)
}

/** Update only taxonomy references for already mapped posts, preserving core edits. */
export async function projectPostCategoriesToCore(tx: CoreTransaction, postIds: string[]) {
  for (const postId of postIds) {
    const [mapping] = await tx
      .select()
      .from(legacyContentMap)
      .where(sql`${legacyContentMap.source} = 'post' and ${legacyContentMap.sourceId} = ${postId}`)
    if (!mapping) continue
    const unchangedTarget = mapping.targetHash === (await coreContentHash(tx, mapping.contentId))
    const [target] = await tx
      .select({ type: content.type })
      .from(content)
      .where(eq(content.id, mapping.contentId))
    if (target?.type !== 'post')
      throw new Error('Mapping artikel tidak valid; rekonsiliasi diperlukan.')
    const assigned = await tx
      .select({ id: postCategories.categoryId })
      .from(postCategories)
      .where(eq(postCategories.postId, postId))
    await tx.execute(
      sql`delete from cms_term_relationships where content_id=${mapping.contentId} and term_taxonomy_id in (select id from cms_term_taxonomy where taxonomy='category')`,
    )
    for (const category of assigned) {
      await projectCategoryToCore(tx, category.id)
      await tx
        .insert(termRelationships)
        .values({
          contentId: mapping.contentId,
          termTaxonomyId: categoryTaxId(category.id),
          order: 0,
        })
        .onConflictDoNothing()
    }
    // Only acknowledge our own relationship change. Pre-existing core drift
    // stays visible and continues to block a subsequent full-row projection.
    if (unchangedTarget)
      await tx
        .update(legacyContentMap)
        .set({ targetHash: await coreContentHash(tx, mapping.contentId) })
        .where(sql`${legacyContentMap.source}='post' and ${legacyContentMap.sourceId}=${postId}`)
  }
  await recountTaxonomies(tx)
}

async function recountTaxonomies(tx: CoreTransaction) {
  await tx.execute(
    sql`update cms_term_taxonomy t set count=(
      select count(*)::int from cms_term_relationships r
      join cms_content c on c.id = r.content_id
      where r.term_taxonomy_id = t.id
        and c.status = 'publish'
        and c.visibility = 'public'
        and c.published_at <= now()
    ) where t.taxonomy in ('category', 'post_tag')`,
  )
}

/**
 * Projects a write on the legacy `posts` table to `cms_content` and related tables.
 * Guaranteed atomic within the same database transaction.
 */
export async function projectPostToCore(tx: CoreTransaction, postId: string) {
  return withProjectionGuard(async () => {
    const targetId = await projectionTarget(tx, 'post', postId)
    const [p] = await tx.select().from(posts).where(eq(posts.id, postId))
    if (!p) return

    // 1. Resolve author user_id
    const [author] = await tx
      .select({ userId: authors.userId })
      .from(authors)
      .where(eq(authors.id, p.authorId))

    const status = p.status === 'published' ? 'publish' : p.status
    const publishedAt = p.status === 'published' ? p.publishedAt : null
    const createdAt = p.publishedAt
    const modifiedAt = p.updatedAt ?? p.publishedAt

    // 2. Upsert into cms_content
    await tx
      .insert(content)
      .values({
        id: targetId,
        type: 'post',
        status,
        authorId: author?.userId ?? null,
        legacyAuthorId: p.authorId,
        slug: p.slug,
        title: p.title,
        content: p.content,
        excerpt: p.excerpt,
        format: 'html',
        visibility: 'public',
        commentStatus: p.allowComments ? 'open' : 'closed',
        guid: `/blog/${p.slug}`,
        publishedAt,
        createdAt,
        modifiedAt,
      })
      .onConflictDoUpdate({
        target: content.id,
        set: {
          status,
          authorId: author?.userId ?? null,
          legacyAuthorId: p.authorId,
          slug: p.slug,
          title: p.title,
          content: p.content,
          excerpt: p.excerpt,
          visibility: 'public',
          commentStatus: p.allowComments ? 'open' : 'closed',
          guid: `/blog/${p.slug}`,
          publishedAt,
          modifiedAt,
        },
      })

    // 3. Upsert into cms_content_meta
    const legacyFields = (await legacySourceRow(tx, 'post', postId))!
    delete legacyFields.content

    await tx
      .insert(contentMeta)
      .values({
        id: legacyMetaId(targetId),
        objectId: targetId,
        key: '_legacy_fields',
        value: legacyFields as JsonValue,
      })
      .onConflictDoUpdate({
        target: contentMeta.id,
        set: {
          value: legacyFields as JsonValue,
        },
      })

    // 4. Sync Categories
    const assignedCats = await tx
      .select({ categoryId: postCategories.categoryId })
      .from(postCategories)
      .where(eq(postCategories.postId, p.id))

    const activeTaxIds: string[] = []

    if (assignedCats.length) {
      const catIds = assignedCats.map((c) => c.categoryId)
      const catRows = await tx.select().from(categories).where(inArray(categories.id, catIds))

      for (const cat of catRows) {
        const cTaxId = categoryTaxId(cat.id)
        activeTaxIds.push(cTaxId)

        await projectCategoryToCore(tx, cat.id)

        await tx
          .insert(termRelationships)
          .values({ contentId: targetId, termTaxonomyId: cTaxId, order: 0 })
          .onConflictDoNothing()
      }
    }

    // 5. Sync Tags
    const assignedTags = await tx
      .select({ tag: postTags.tag })
      .from(postTags)
      .where(eq(postTags.postId, p.id))

    if (assignedTags.length) {
      for (const { tag } of assignedTags) {
        const tId = tagId(tag)
        const tTaxId = tagTaxId(tag)
        const slug = (slugify(tag).slice(0, 140) || 'tag') + '-' + tId.slice(0, 8)
        activeTaxIds.push(tTaxId)

        await tx.insert(terms).values({ id: tId, name: tag, slug }).onConflictDoNothing()

        await tx
          .insert(termTaxonomy)
          .values({ id: tTaxId, termId: tId, taxonomy: 'post_tag' })
          .onConflictDoNothing()

        await tx
          .insert(termMeta)
          .values({
            id: stableId('tag-meta', tag),
            objectId: tId,
            key: '_legacy_tag',
            value: tag,
          })
          .onConflictDoNothing()

        await tx
          .insert(termRelationships)
          .values({ contentId: targetId, termTaxonomyId: tTaxId, order: 0 })
          .onConflictDoNothing()
      }
    }

    // Remove obsolete relationships
    if (activeTaxIds.length) {
      await tx.execute(
        sql`delete from cms_term_relationships where content_id = ${targetId}
        and term_taxonomy_id in (select id from cms_term_taxonomy where taxonomy in ('category','post_tag'))
        and term_taxonomy_id not in (${sql.join(
          activeTaxIds.map((id) => sql`${id}`),
          sql`,`,
        )})`,
      )
    } else {
      await tx.execute(sql`delete from cms_term_relationships where content_id = ${targetId}
        and term_taxonomy_id in (select id from cms_term_taxonomy where taxonomy in ('category','post_tag'))`)
    }

    // 6. Update legacy content map
    await recountTaxonomies(tx)
    await checkpointProjection(tx, 'post', p.id, targetId)
  })
}

/**
 * Projects a write on the legacy `pages` table to `cms_content`.
 */
export async function projectPageToCore(tx: CoreTransaction, pageId: string) {
  return withProjectionGuard(async () => {
    const targetId = await projectionTarget(tx, 'page', pageId)
    const [pg] = await tx.select().from(pages).where(eq(pages.id, pageId))
    if (!pg) return

    await tx
      .insert(content)
      .values({
        id: targetId,
        type: 'page',
        status: 'publish',
        authorId: null,
        legacyAuthorId: null,
        slug: pg.slug,
        title: pg.title,
        content: pg.content,
        excerpt: '',
        format: 'html',
        visibility: 'public',
        guid: `/${pg.slug}`,
        publishedAt: pg.updatedAt,
        createdAt: pg.updatedAt,
        modifiedAt: pg.updatedAt,
      })
      .onConflictDoUpdate({
        target: content.id,
        set: {
          slug: pg.slug,
          title: pg.title,
          content: pg.content,
          modifiedAt: pg.updatedAt,
        },
      })

    const legacyFields = (await legacySourceRow(tx, 'page', pageId))!
    delete legacyFields.content
    await tx
      .insert(contentMeta)
      .values({
        id: legacyMetaId(targetId),
        objectId: targetId,
        key: '_legacy_fields',
        value: legacyFields as JsonValue,
      })
      .onConflictDoUpdate({
        target: contentMeta.id,
        set: { value: legacyFields as JsonValue },
      })

    await checkpointProjection(tx, 'page', pg.id, targetId)
  })
}

/** Media keeps its legacy blob URL even when the unified content ID is mapped. */
export async function projectMediaToCore(tx: CoreTransaction, mediaId: string) {
  return withProjectionGuard(async () => {
    const targetId = await projectionTarget(tx, 'media', mediaId)
    const [row] = await tx
      .select({
        id: media.id,
        name: media.name,
        title: media.title,
        mimeType: media.mimeType,
        uploadedBy: media.uploadedBy,
        createdAt: media.createdAt,
      })
      .from(media)
      .where(eq(media.id, mediaId))
    if (!row) return
    const values = {
      type: 'attachment',
      status: 'inherit',
      authorId: row.uploadedBy,
      title: row.title || row.name,
      mimeType: row.mimeType,
      guid: `/api/media/${row.id}`,
      commentStatus: 'closed',
      createdAt: row.createdAt,
      modifiedAt: row.createdAt,
    }
    await tx
      .insert(content)
      .values({ id: targetId, ...values })
      .onConflictDoUpdate({
        target: content.id,
        set: { title: row.title || row.name, mimeType: row.mimeType, authorId: row.uploadedBy },
      })
    const fields = (await legacySourceRow(tx, 'media', mediaId))!
    delete fields.data_hash
    for (const entry of [
      { id: legacyMetaId(targetId), key: '_legacy_fields', value: fields as JsonValue },
      { id: stableId('media-meta', targetId), key: '_media_blob_id', value: mediaId },
    ])
      await tx
        .insert(contentMeta)
        .values({ ...entry, objectId: targetId })
        .onConflictDoUpdate({ target: contentMeta.id, set: { value: entry.value } })
    await checkpointProjection(tx, 'media', mediaId, targetId)
  })
}

/**
 * Deletes projected row from `cms_content` when a legacy post or page is deleted.
 */
export async function deleteCoreProjection(
  tx: CoreTransaction,
  sourceId: string,
  source: 'post' | 'page' | 'media',
) {
  return withProjectionGuard(async () => {
    await lockContentStructure(tx)
    const mapping = await getContentMapping(tx, source, sourceId)
    if (!mapping) return
    // Includes a drift/type check before deleting a source-qualified target.
    const targetId = await projectionTarget(tx, source, sourceId)
    await tx.delete(content).where(eq(content.id, targetId))
    await recountTaxonomies(tx)
  })
}

/**
 * Explicit rollback/compatibility adapter. Runtime core services do not call this
 * before cutover: legacy remains the only writer for mapped records.
 * A shape the legacy schema cannot represent is rejected, never downgraded.
 */
export async function projectCoreToLegacy(tx: CoreTransaction, contentId: string) {
  return withProjectionGuard(async () => {
    await lockContentStructure(tx)
    const [c] = await tx.select().from(content).where(eq(content.id, contentId))
    if (!c || !['post', 'page'].includes(c.type)) return
    if (
      c.format !== 'html' ||
      c.visibility !== 'public' ||
      c.parentId ||
      !['publish', 'draft', 'pending'].includes(c.status) ||
      (c.type === 'page' && c.status !== 'publish')
    )
      throw new Error('Konten tidak dapat direpresentasikan oleh schema legacy; rollback ditolak.')
    const source = c.type as 'post' | 'page'
    const [mapping] = await tx
      .select()
      .from(legacyContentMap)
      .where(eq(legacyContentMap.contentId, c.id))
    if (mapping && mapping.source !== source) throw new Error('Mapping jenis konten tidak valid.')
    const sourceId = mapping?.sourceId ?? c.id
    if (sourceId.length > 32) throw new Error('Identitas legacy tidak dapat direpresentasikan.')
    const oldRow = await legacySourceRow(tx, source, sourceId)
    if (mapping) {
      if (!oldRow || !(await legacySourceMatches(tx, { ...mapping, source })))
        throw new Error('Sumber legacy telah berubah; rollback tidak boleh menimpa edit pengguna.')
    } else if (oldRow) {
      throw new Error('Identitas legacy sudah digunakan; rollback memerlukan mapping eksplisit.')
    }
    const table = source === 'post' ? posts : pages
    const [collision] = await tx
      .select({ id: table.id })
      .from(table)
      .where(sql`${table.slug}=${c.slug} and ${table.id}<>${sourceId}`)
      .limit(1)
    if (collision) throw new Error('Slug legacy bertabrakan; URL tidak akan diubah otomatis.')
    const metaRows = await tx
      .select({ key: contentMeta.key, value: contentMeta.value })
      .from(contentMeta)
      .where(eq(contentMeta.objectId, c.id))
      .orderBy(contentMeta.id)
    const allMeta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]))
    const meta = (allMeta._legacy_fields as Record<string, unknown>) ?? {}
    // Older prototype projections used camelCase; S2A stores PostgreSQL snake_case.
    const field = (snake: string, camel: string) => meta[snake] ?? meta[camel]
    if (source === 'post') {
      let authorId = c.legacyAuthorId
      if (authorId) {
        if (
          !(await tx.select({ id: authors.id }).from(authors).where(eq(authors.id, authorId)))
            .length
        )
          throw new Error('Profil atribusi penulis hilang; rollback ditolak.')
      } else if (c.authorId) {
        const [profile] = await tx
          .select({ id: authors.id })
          .from(authors)
          .where(eq(authors.userId, c.authorId))
        if (profile) authorId = profile.id
        else {
          // Provision only the actual owner. Never attribute an orphan to the first author/admin.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-user-authors'))`)
          const owner = (
            await tx.execute(sql`select name,image from cms_user where id=${c.authorId}`)
          ).rows[0]
          if (!owner) throw new Error('Akun penulis hilang; rollback ditolak.')
          authorId = stableId('core-author-profile', c.authorId)
          await tx.insert(authors).values({
            id: authorId,
            userId: c.authorId,
            name: String(owner.name).slice(0, 160),
            avatar: owner.image as string | null,
            slug: `penulis-${authorId}`,
          })
        }
      }
      if (!authorId) throw new Error('Konten tanpa atribusi penulis tidak dapat diproyeksikan.')
      const values = {
        title: c.title,
        slug: c.slug,
        excerpt: c.excerpt,
        content: c.content,
        authorId,
        status: c.status === 'publish' ? 'published' : c.status,
        allowComments: c.commentStatus === 'open',
        featuredImage: (allMeta.featured_image ??
          field('featured_image', 'featuredImage') ??
          null) as string | null,
        featuredImageAlt: (allMeta.featured_image_alt ??
          field('featured_image_alt', 'featuredImageAlt') ??
          null) as string | null,
        isSponsored: Boolean(allMeta.is_sponsored ?? field('is_sponsored', 'isSponsored')),
        isProduct: Boolean(allMeta.is_product ?? field('is_product', 'isProduct')),
        isYoutube: Boolean(allMeta.is_youtube ?? field('is_youtube', 'isYoutube')),
        showAds:
          field('show_ads', 'showAds') === undefined ? true : Boolean(field('show_ads', 'showAds')),
        readingTime: Number(field('reading_time', 'readingTime') ?? 1),
        wordCount: Number(field('word_count', 'wordCount') ?? 0),
        viewCount: Number(oldRow?.view_count ?? field('view_count', 'viewCount') ?? 0),
        commentCount: Number(oldRow?.comment_count ?? field('comment_count', 'commentCount') ?? 0),
        layout: (allMeta.layout ?? meta.layout ?? 'default') as Post['layout'],
        publishedAt: c.publishedAt ?? c.createdAt,
        updatedAt: c.modifiedAt,
        legacyPath: (allMeta.legacy_path ?? field('legacy_path', 'legacyPath') ?? null) as
          string | null,
        seo: (allMeta.seo ?? meta.seo ?? null) as SEO | null,
      }
      await tx
        .insert(posts)
        .values({ id: sourceId, ...values })
        .onConflictDoUpdate({ target: posts.id, set: values })
      await projectCorePostTermsToLegacy(tx, c.id, sourceId)
    } else {
      const values = {
        title: c.title,
        slug: c.slug,
        content: c.content,
        updatedAt: c.modifiedAt,
        seo: (allMeta.seo ?? meta.seo ?? null) as SEO | null,
      }
      await tx
        .insert(pages)
        .values({ id: sourceId, ...values })
        .onConflictDoUpdate({ target: pages.id, set: values })
    }
    await checkpointProjection(tx, source, sourceId, c.id)
  })
}

async function projectCorePostTermsToLegacy(
  tx: CoreTransaction,
  contentId: string,
  postId: string,
) {
  const assigned = (
    await tx.execute(sql`select tt.id,tt.term_id,tt.taxonomy,tt.parent_id,
    tt.description,t.name,t.slug from cms_term_relationships r
    join cms_term_taxonomy tt on tt.id=r.term_taxonomy_id join cms_terms t on t.id=tt.term_id
    where r.content_id=${contentId} and tt.taxonomy in ('category','post_tag') order by tt.id`)
  ).rows
  const visited = new Set<string>()
  async function category(id: string, path = new Set<string>()): Promise<string> {
    if (path.has(id) || path.size >= 64) throw new Error('Hierarki term tidak dapat diproyeksikan.')
    const row = (
      await tx.execute(sql`select tt.term_id,tt.parent_id,tt.description,t.name,t.slug
      from cms_term_taxonomy tt join cms_terms t on t.id=tt.term_id
      where tt.id=${id} and tt.taxonomy='category'`)
    ).rows[0]
    if (!row || String(row.slug).length > 160)
      throw new Error('Kategori tidak dapat direpresentasikan.')
    const termId = String(row.term_id)
    if (visited.has(id)) return termId
    path.add(id)
    const parentId = row.parent_id ? await category(String(row.parent_id), path) : null
    const [existing] = await tx.select().from(categories).where(eq(categories.id, termId))
    // No per-term source checkpoint exists yet. Refuse conflicting edits rather than guess ownership.
    if (
      existing &&
      (existing.name !== row.name ||
        existing.slug !== row.slug ||
        (existing.description ?? '') !== row.description ||
        existing.parentId !== parentId)
    )
      throw new Error('Kategori legacy/core berbeda; rekonsiliasi taxonomy diperlukan.')
    if (!existing)
      await tx.insert(categories).values({
        id: termId,
        name: String(row.name),
        slug: String(row.slug),
        description: String(row.description),
        parentId,
      })
    visited.add(id)
    return termId
  }
  const categoryIds: string[] = [],
    tags: string[] = []
  for (const row of assigned) {
    if (row.taxonomy === 'category') categoryIds.push(await category(String(row.id)))
    else {
      const name = String(row.name)
      if (!name.length || name.length > 120) throw new Error('Tag tidak dapat direpresentasikan.')
      tags.push(name)
    }
  }
  await tx.delete(postCategories).where(eq(postCategories.postId, postId))
  await tx.delete(postTags).where(eq(postTags.postId, postId))
  for (const categoryId of new Set(categoryIds))
    await tx.insert(postCategories).values({ postId, categoryId })
  for (const tag of new Set(tags)) await tx.insert(postTags).values({ postId, tag })
}

/** Explicit reverse deletion uses the source-qualified mapping, never the core ID alone. */
export async function deleteLegacyFromCore(tx: CoreTransaction, id: string, type: string) {
  return withProjectionGuard(async () => {
    await lockContentStructure(tx)
    const [mapping] = await tx
      .select()
      .from(legacyContentMap)
      .where(eq(legacyContentMap.contentId, id))
    if (!mapping) return
    if (mapping.source !== type) throw new Error('Mapping jenis konten tidak valid.')
    if (
      mapping.sourceHash !==
      (await legacySourceHash(tx, mapping.source as 'post' | 'page', mapping.sourceId))
    )
      throw new Error('Sumber legacy telah berubah; penghapusan ditolak.')
    if (type === 'post') await tx.delete(posts).where(eq(posts.id, mapping.sourceId))
    else if (type === 'page') await tx.delete(pages).where(eq(pages.id, mapping.sourceId))
  })
}
