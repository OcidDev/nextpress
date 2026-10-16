import { sql } from 'drizzle-orm'
import type { CoreTransaction } from '@/lib/db/meta-store'
import { sha, stableId } from './content-identity'

export type LegacyContentSource = 'post' | 'page' | 'media'
export type ContentMapping = {
  source: LegacyContentSource
  sourceId: string
  contentId: string
  sourceHash: string
  targetHash: string
}

/** All content writers take taxonomy before content, before locking individual rows. */
export async function lockContentStructure(tx: CoreTransaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-taxonomy-structure'))`)
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-content-structure'))`)
}

export async function getContentMapping(
  tx: CoreTransaction,
  source: LegacyContentSource,
  sourceId: string,
): Promise<ContentMapping | undefined> {
  return (
    await tx.execute(sql`select source,source_id as "sourceId",content_id as "contentId",
    source_hash as "sourceHash",target_hash as "targetHash"
    from cms_legacy_content_map where source=${source} and source_id=${sourceId}`)
  ).rows[0] as ContentMapping | undefined
}

/** Same PostgreSQL JSON representation and ordering as the S2A shadow checkpoint. */
export async function coreContentHash(tx: CoreTransaction, id: string) {
  const row = (await tx.execute(sql`select to_jsonb(t) as row from cms_content t where id=${id}`))
    .rows[0]?.row
  const meta = (
    await tx.execute(sql`select meta_key,meta_value from cms_content_meta
    where object_id=${id} order by meta_key,id`)
  ).rows
  const relationships = (
    await tx.execute(sql`select term_taxonomy_id,term_order
    from cms_term_relationships where content_id=${id} order by term_taxonomy_id`)
  ).rows
  return sha({ row, meta, relationships })
}

export async function legacySourceRow(
  tx: CoreTransaction,
  source: LegacyContentSource,
  id: string,
) {
  const query =
    source === 'post'
      ? sql`select to_jsonb(t)-'search_vector' as row from posts t where id=${id}`
      : source === 'page'
        ? sql`select to_jsonb(t) as row from pages t where id=${id}`
        : sql`select jsonb_build_object('id',t.id,'name',t.name,'mime_type',t.mime_type,
          'size',t.size,'width',t.width,'height',t.height,'alt',t.alt,
          'title',t.title,'caption',t.caption,'description',t.description,
          'uploaded_by',t.uploaded_by,'created_at',t.created_at,'data_hash',md5(t.data)) as row
          from cms_media t where id=${id}`
  return (await tx.execute(query)).rows[0]?.row as Record<string, unknown> | undefined
}

export async function legacySourceHash(
  tx: CoreTransaction,
  source: LegacyContentSource,
  id: string,
) {
  const row = await legacySourceRow(tx, source, id)
  const account =
    source === 'post' && row
      ? ((await tx.execute(sql`select user_id from authors where id=${row.author_id}`)).rows[0]
          ?.user_id ?? null)
      : null
  return sha({ row, account })
}

/** Counters remain legacy-owned; allow only that delta and preserve their current values. */
export async function legacySourceMatches(
  tx: CoreTransaction,
  mapping: Pick<ContentMapping, 'source' | 'sourceId' | 'contentId' | 'sourceHash'>,
) {
  if (mapping.sourceHash === (await legacySourceHash(tx, mapping.source, mapping.sourceId)))
    return true
  if (mapping.source !== 'post') return false
  const row = await legacySourceRow(tx, 'post', mapping.sourceId)
  if (!row) return false
  const meta = (
    await tx.execute(sql`select meta_value from cms_content_meta
    where object_id=${mapping.contentId} and meta_key in ('_legacy_counters','_legacy_fields')
    order by case when meta_key='_legacy_counters' then 0 else 1 end,id limit 1`)
  ).rows
  if (!meta.length) return false
  const baseline = meta[0]!.meta_value as Record<string, unknown>
  if (typeof baseline.view_count !== 'number' || typeof baseline.comment_count !== 'number')
    return false
  const account =
    (await tx.execute(sql`select user_id from authors where id=${row.author_id}`)).rows[0]
      ?.user_id ?? null
  return (
    mapping.sourceHash ===
    sha({
      row: { ...row, view_count: baseline.view_count, comment_count: baseline.comment_count },
      account,
    })
  )
}

/** Never infer ownership from an equal ID or a slug. Unmapped rows are never overwritten. */
export async function projectionTarget(
  tx: CoreTransaction,
  source: LegacyContentSource,
  sourceId: string,
) {
  await lockContentStructure(tx)
  const previous = await getContentMapping(tx, source, sourceId)
  if (previous) {
    const target = (
      await tx.execute(sql`select type from cms_content where id=${previous.contentId}`)
    ).rows[0]
    if (target?.type !== (source === 'media' ? 'attachment' : source))
      throw new Error('Mapping konten tidak valid; rekonsiliasi diperlukan.')
    if (previous.targetHash !== (await coreContentHash(tx, previous.contentId)))
      throw new Error('Target telah berubah; projection tidak boleh menimpa edit core.')
    return previous.contentId
  }
  let id = sourceId.length > 0 && sourceId.length <= 32 ? sourceId : stableId(source, sourceId)
  if ((await tx.execute(sql`select 1 from cms_content where id=${id}`)).rows.length)
    id = stableId(source, sourceId)
  if ((await tx.execute(sql`select 1 from cms_content where id=${id}`)).rows.length)
    throw new Error('Identitas konten bertabrakan; rekonsiliasi mapping diperlukan.')
  return id
}

export async function checkpointProjection(
  tx: CoreTransaction,
  source: LegacyContentSource,
  sourceId: string,
  contentId: string,
) {
  const sourceHash = await legacySourceHash(tx, source, sourceId)
  if (source === 'post') {
    const row = (await legacySourceRow(tx, source, sourceId))!
    const counterId = stableId('legacy-counters', contentId)
    await tx.execute(sql`insert into cms_content_meta(id,object_id,meta_key,meta_value)
      values(${counterId},${contentId},'_legacy_counters',${JSON.stringify({ view_count: row.view_count, comment_count: row.comment_count })}::jsonb)
      on conflict(id) do update set meta_value=excluded.meta_value`)
  }
  const targetHash = await coreContentHash(tx, contentId)
  await tx.execute(sql`insert into cms_legacy_content_map(source,source_id,content_id,source_hash,target_hash)
    values(${source},${sourceId},${contentId},${sourceHash},${targetHash})
    on conflict(source,source_id) do update set source_hash=excluded.source_hash,
      target_hash=excluded.target_hash,migrated_at=now()`)
}

/** Until the cutover gate is implemented, core services cannot become a second writer. */
export async function assertUnmappedCoreWrite(tx: CoreTransaction, id: string) {
  if (
    (await tx.execute(sql`select 1 from cms_legacy_content_map where content_id=${id}`)).rows.length
  )
    throw new Error('Konten legacy masih authoritative; gunakan adaptor editor sampai cutover S2B.')
}

export async function assertUnmappedCoreTermWrite(tx: CoreTransaction, id: string) {
  if (
    (
      await tx.execute(sql`select 1 from cms_term_taxonomy tt where tt.id=${id} and (
    exists(select 1 from categories c where c.id=tt.term_id and tt.taxonomy='category')
    or exists(select 1 from cms_term_meta m where m.object_id=tt.term_id and m.meta_key='_legacy_tag')
    or exists(select 1 from cms_term_relationships r join cms_legacy_content_map m
      on m.content_id=r.content_id where r.term_taxonomy_id=tt.id))`)
    ).rows.length
  )
    throw new Error('Taxonomy legacy masih authoritative; rekonsiliasi S2B diperlukan.')
}
