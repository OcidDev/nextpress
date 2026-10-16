import { z } from 'zod'
import { sql } from 'drizzle-orm'
import type { CoreTransaction } from '@/lib/db/meta-store'
import { newId } from '@/lib/db/ids'
import { slugSchema } from '@/lib/content/validation'
import { currentUserCan, type Actor, type RoleRegistry } from './roles'
import type { CoreRegistry } from './registry'
import { contentSelection, recountTerms, type ContentRecord } from './content'
import {
  assertUnmappedCoreTermWrite,
  assertUnmappedCoreWrite,
  lockContentStructure,
} from './content-mapping'

export type TermRecord = {
  id: string
  termId: string
  taxonomy: string
  parentId: string | null
  name: string
  slug: string
  description: string
  count: number
}
const selection = sql`t.id,t.term_id as "termId",t.taxonomy,t.parent_id as "parentId",v.name,v.slug,t.description,t.count`
const inputSchema = z
  .object({
    id: z.string().min(1).max(32).optional(),
    taxonomy: z.string(),
    name: z.string().trim().min(1).max(160),
    slug: slugSchema,
    parentId: z.string().min(1).max(32).nullable().default(null),
    description: z.string().max(5000).default(''),
  })
  .strict()

export function createTermService(
  tx: CoreTransaction,
  registry: CoreRegistry,
  actor: Actor | null,
  roles: RoleRegistry,
) {
  function taxonomy(name: string, write = false) {
    const def = registry.taxonomies.get(name)
    if (!def) throw new Error('Taksonomi tidak terdaftar.')
    if (
      write &&
      !currentUserCan(
        actor,
        'manage_categories',
        undefined,
        roles,
      )
    )
      throw new Error('Izin taksonomi ditolak.')
    return def
  }
  async function raw(id: string) {
    return (
      await tx.execute(
        sql`select ${selection} from cms_term_taxonomy t join cms_terms v on v.id=t.term_id where t.id=${id}`,
      )
    ).rows[0] as TermRecord | undefined
  }
  async function lock() {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-taxonomy-structure'))`)
  }
  return {
    async list(name: string, context: 'view' | 'edit' = 'view') {
      z.enum(['view', 'edit']).parse(context)
      const def = taxonomy(name, context === 'edit')
      if (context === 'view' && !def.public) return []
      return (
        await tx.execute(
          sql`select ${selection} from cms_term_taxonomy t join cms_terms v on v.id=t.term_id where t.taxonomy=${name} order by v.name,t.id limit 1000`,
        )
      ).rows as TermRecord[]
    },
    async save(value: unknown) {
      const input = inputSchema.parse(value),
        def = taxonomy(input.taxonomy, true)
      await lock()
      const id = input.id ?? newId(),
        old = await raw(id)
      await assertUnmappedCoreTermWrite(tx, id)
      if (input.id && !old) throw new Error('Term tidak ditemukan.')
      if (old && old.taxonomy !== input.taxonomy)
        throw new Error('Taksonomi term existing tidak dapat diubah.')
      if (input.parentId && !def.hierarchical)
        throw new Error('Taksonomi non-hierarkis tidak menerima parent.')
      let parent = input.parentId
      const visited = new Set([id])
      while (parent) {
        if (visited.has(parent) || visited.size > 64)
          throw new Error('Parent term membentuk siklus atau terlalu dalam.')
        visited.add(parent)
        const row = await raw(parent)
        if (!row || row.taxonomy !== input.taxonomy)
          throw new Error('Parent term harus berada pada taksonomi yang sama.')
        parent = row.parentId
      }
      const collision =
        await tx.execute(sql`select t.id from cms_term_taxonomy t join cms_terms v on v.id=t.term_id
        where t.taxonomy=${input.taxonomy} and t.parent_id is not distinct from ${input.parentId} and v.slug=${input.slug} and t.id<>${id} limit 1`)
      if (collision.rows.length) throw new Error('Slug term sudah dipakai dalam namespace ini.')
      const termId = old?.termId ?? newId()
      await tx.execute(
        sql`insert into cms_terms(id,name,slug) values(${termId},${input.name},${input.slug}) on conflict(id) do update set name=excluded.name,slug=excluded.slug`,
      )
      await tx.execute(sql`insert into cms_term_taxonomy(id,term_id,taxonomy,parent_id,description) values(${id},${termId},${input.taxonomy},${input.parentId},${input.description})
        on conflict(id) do update set parent_id=excluded.parent_id,description=excluded.description`)
      return (await raw(id))!
    },
    async setTerms(contentId: string, name: string, ids: readonly string[]) {
      const def = taxonomy(name)
      const unique = [...new Set(ids.map((id) => z.string().min(1).max(32).parse(id)))]
      if (unique.length > 200) throw new Error('Maksimal 200 term per operasi.')
      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, contentId)
      const object = (
        await tx.execute(
          sql`select ${contentSelection} from cms_content where id=${contentId} for share`,
        )
      ).rows[0] as ContentRecord | undefined
      if (!object || !def.objectTypes.includes(object.type))
        throw new Error('Taksonomi tidak mendukung jenis konten ini.')
      const type = registry.types.get(object.type)
      const status = registry.statuses.get(object.status)
      if (
        !type ||
        !status ||
        !currentUserCan(
          actor,
          'edit_post',
          {
            ...object,
            capabilityType: type.capabilityType,
            public: type.public,
            statusPublic: status.public,
          },
          roles,
        )
      )
        throw new Error('Izin assign term ditolak.')
      const found = unique.length
        ? await tx.execute(
            sql`select id from cms_term_taxonomy where taxonomy=${name} and id in (${sql.join(
              unique.map((id) => sql`${id}`),
              sql`,`,
            )})`,
          )
        : { rows: [] }
      if (found.rows.length !== unique.length)
        throw new Error('Term tidak ditemukan pada taksonomi ini.')
      await tx.execute(
        sql`delete from cms_term_relationships where content_id=${contentId} and term_taxonomy_id in (select id from cms_term_taxonomy where taxonomy=${name})`,
      )
      for (const [order, id] of unique.entries())
        await tx.execute(
          sql`insert into cms_term_relationships(content_id,term_taxonomy_id,term_order) values(${contentId},${id},${order})`,
        )
      await recountTerms(tx, registry)
    },
    async delete(id: string) {
      await lock()
      await assertUnmappedCoreTermWrite(tx, id)
      const old = await raw(id)
      if (!old) return false
      taxonomy(old.taxonomy, true)
      await tx.execute(sql`delete from cms_term_taxonomy where id=${id}`)
      await tx.execute(
        sql`delete from cms_terms where id=${old.termId} and not exists(select 1 from cms_term_taxonomy where term_id=${old.termId})`,
      )
      return true
    },
  }
}
