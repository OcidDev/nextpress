import { sql } from 'drizzle-orm'
import type { getDb } from './index'
import { newId } from './ids'
import { metaKinds, type MetaKind, type MetaRow, type MetaStore } from '@/lib/core/meta'
import { z } from 'zod'
import {
  assertUnmappedCoreTermWrite,
  assertUnmappedCoreWrite,
  lockContentStructure,
} from '@/lib/core/content-mapping'

export type CoreTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
type Reader = Pick<ReturnType<typeof getDb>, 'execute'>
const tableNames = {
  content: 'cms_content_meta',
  user: 'cms_user_meta',
  comment: 'cms_comment_meta',
  term: 'cms_term_meta',
}
const table = (kind: MetaKind) => sql.raw(tableNames[z.enum(metaKinds).parse(kind)])

export function createPostgresMetaReader(db: Reader) {
  return {
    async read(kind: MetaKind, ids: string[]) {
      if (!ids.length) return []
      const result = await db.execute(sql`with selected as (select id,object_id,meta_key,meta_value
      from ${table(kind)} where object_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`,`,
      )}) order by object_id,id limit 4097), bounded as (
        select *,sum(octet_length(meta_value::text)) over() as bytes from selected
      ) select id,object_id as "objectId",meta_key as key,
        case when bytes<=4194304 then meta_value else null end as value,bytes
        from bounded order by object_id,id`)
      if (result.rows.length > 4096)
        throw new Error('Preload meta melebihi 4096 baris; perkecil batch.')
      if (result.rows[0] && Number(result.rows[0].bytes) > 4194304)
        throw new Error('Preload meta melebihi 4 MiB; perkecil batch.')
      return result.rows.map((row) => ({
        id: row.id as string,
        objectId: row.objectId as string,
        key: row.key as string,
        value: row.value as MetaRow['value'],
      }))
    },
  }
}
/** Only accepts a transaction: advisory locks cannot be used in autocommit. */
export function createPostgresMetaStore(tx: CoreTransaction): MetaStore {
  async function lock(kind: MetaKind, id: string, key: string) {
    if (kind === 'content') {
      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, id)
    }
    if (kind === 'term') {
      await lockContentStructure(tx)
      const taxonomies = (
        await tx.execute(sql`select id from cms_term_taxonomy where term_id=${id}`)
      ).rows
      for (const row of taxonomies) await assertUnmappedCoreTermWrite(tx, String(row.id))
    }
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['meta', kind, id, key])},0))`,
    )
  }
  return {
    ...createPostgresMetaReader(tx),
    async add(kind, objectId, key, value, single) {
      await lock(kind, objectId, key)
      const existing = await tx.execute(
        sql`select id from ${table(kind)} where object_id=${objectId} and meta_key=${key} limit 65`,
      )
      if (single && existing.rows.length)
        throw new Error('Meta single sudah ada; update melalui ID baris.')
      if (existing.rows.length >= 64) throw new Error('Maksimal 64 nilai per key meta.')
      const id = newId()
      await tx.execute(
        sql`insert into ${table(kind)}(id,object_id,meta_key,meta_value) values(${id},${objectId},${key},${JSON.stringify(value)}::jsonb)`,
      )
      return { id, objectId, key, value }
    },
    async update(kind, objectId, key, id, value) {
      await lock(kind, objectId, key)
      const result = await tx.execute(
        sql`update ${table(kind)} set meta_value=${JSON.stringify(value)}::jsonb where id=${id} and object_id=${objectId} and meta_key=${key} returning id`,
      )
      return !!result.rows.length
    },
    async delete(kind, objectId, key, id) {
      await lock(kind, objectId, key)
      const result = await tx.execute(
        sql`delete from ${table(kind)} where object_id=${objectId} and meta_key=${key} ${id === undefined ? sql`` : sql`and id=${id}`} returning id`,
      )
      return !!result.rows.length
    },
  }
}
