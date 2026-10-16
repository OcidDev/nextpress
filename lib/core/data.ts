import { sql } from 'drizzle-orm'
import { createPostgresMetaStore, type CoreTransaction } from '@/lib/db/meta-store'
import { createCoreRegistry, type CoreRegistry } from './registry'
import { createContentService } from './content'
import { createTermService } from './terms'
import { createMetaApi, type BatchMetaPermission } from './meta'
import { createQueryService } from './query'
import { createRevisionService } from './revisions'
import { createLifecycleService } from './lifecycle'
import { createCronService } from './cron'
import { createAttachmentService } from './attachments'
import { currentUserCan, type Actor, type RoleRegistry, type PermissionObject } from './roles'

/** Used inside one transaction; never accept an actor from a form or REST body. */
export function createDataServices(
  tx: CoreTransaction,
  actor: Actor | null,
  roles: RoleRegistry,
  registry: CoreRegistry = createCoreRegistry(),
) {
  const content = createContentService(tx, registry, actor, roles)
  const terms = createTermService(tx, registry, actor, roles)
  const can: BatchMetaPermission = async (kind, id, operation, context) => {
    if (kind === 'content')
      return operation === 'read' && context === 'view'
        ? !!(await content.get(id, 'view'))
        : content.can(id, operation === 'write' ? 'edit_post' : 'read_post')
    if (kind === 'user') {
      const exists = (await tx.execute(sql`select id from cms_user where id=${id}`)).rows.length > 0
      return (
        exists &&
        !!actor &&
        (actor.id === id
          ? currentUserCan(actor, 'edit_profile', undefined, roles)
          : currentUserCan(actor, 'edit_users', undefined, roles))
      )
    }
    if (kind === 'comment') {
      const exists = (await tx.execute(sql`select id from comments where id=${id}`)).rows.length > 0
      return exists && currentUserCan(actor, 'moderate_comments', undefined, roles)
    }
    const references = await tx.execute(
      sql`select taxonomy from cms_term_taxonomy where term_id=${id}`,
    )
    return (
      references.rows.length > 0 &&
      references.rows.every((row) => {
        const taxonomy = registry.taxonomies.get(row.taxonomy as string)
        if (!taxonomy) return false
        return operation === 'read' && context === 'view'
          ? taxonomy.public
          : currentUserCan(
              actor,
              'manage_categories',
              undefined,
              roles,
            )
      })
    )
  }
  can.batch = async (kind, ids, context) => {
    if (!ids.length) return []
    const values = sql.join(
      ids.map((id) => sql`${id}`),
      sql`,`,
    )
    if (kind === 'content') {
      type ObjectRow = PermissionObject & { id: string; parentId: string | null }
      const result = await tx.execute(
        sql`select id,type,status,parent_id as "parentId",author_id as "authorId",visibility,published_at as "publishedAt" from cms_content where id in (${values})`,
      )
      const records = new Map((result.rows as ObjectRow[]).map((row) => [row.id, row]))
      return Promise.all(
        ids.map(async (id) => {
          const row = records.get(id)
          if (!row) return false
          // Inherited permissions need parent traversal; ordinary list rows stay batched.
          if (
            context !== 'view' &&
            (row.type === 'revision' ||
              (row.type === 'attachment' && row.status === 'inherit' && row.parentId))
          )
            return content.can(id, 'read_post')
          const type = registry.types.get(row.type),
            status = registry.statuses.get(row.status)
          return (
            !!type &&
            !!status &&
            currentUserCan(
              context === 'view' ? null : actor,
              'read_post',
              {
                ...row,
                publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
                capabilityType: type.capabilityType,
                public: type.public,
                statusPublic: status.public,
              },
              roles,
            )
          )
        }),
      )
    }
    if (kind === 'user' || kind === 'comment') {
      const table = kind === 'user' ? sql`cms_user` : sql`comments`
      const found = new Set(
        (await tx.execute(sql`select id from ${table} where id in (${values})`)).rows.map(
          (row) => row.id,
        ),
      )
      return ids.map(
        (id) =>
          found.has(id) &&
          (kind === 'user'
            ? !!actor &&
              currentUserCan(
                actor,
                actor.id === id ? 'edit_profile' : 'edit_users',
                undefined,
                roles,
              )
            : currentUserCan(actor, 'moderate_comments', undefined, roles)),
      )
    }
    const found = (
      await tx.execute(
        sql`select term_id as id,taxonomy from cms_term_taxonomy where term_id in (${values})`,
      )
    ).rows
    return ids.map((id) => {
      const references = found.filter((row) => row.id === id)
      return (
        !!references.length &&
        references.every((row) => {
          const taxonomy = registry.taxonomies.get(row.taxonomy as string)
          return (
            !!taxonomy &&
            (context === 'view'
              ? taxonomy.public
              : currentUserCan(
                  actor,
                  'manage_categories',
                  undefined,
                  roles,
                ))
          )
        })
      )
    })
  }
  const meta = createMetaApi(createPostgresMetaStore(tx), registry.meta, can)
  const query = createQueryService(tx, registry, actor, roles)
  const revisions = createRevisionService(tx, registry, actor, roles)
  const lifecycle = createLifecycleService(tx, registry, actor, roles)
  const cron = createCronService(tx)
  const attachments = createAttachmentService(tx, actor, roles)
  return {
    content,
    terms,
    meta,
    registry,
    query,
    revisions,
    lifecycle,
    cron,
    attachments,
  }
}
