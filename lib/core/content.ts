import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { hashPassword } from 'better-auth/crypto'
import { newId } from '@/lib/db/ids'
import type { CoreTransaction } from '@/lib/db/meta-store'
import { cleanHtml, wordCount } from '@/lib/content/sanitize'
import { slugify } from '@/lib/utils'
import { reservedPageSlugs } from '@/lib/content/validation'
import type { CoreRegistry } from './registry'
import {
  currentUserCan,
  type Actor,
  type RoleRegistry,
  type PermissionObject,
  type ObjectCapability,
} from './roles'
import { assertUnmappedCoreWrite, lockContentStructure } from './content-mapping'

export type ContentRecord = PermissionObject & {
  id: string
  parentId: string | null
  slug: string
  title: string
  content: string
  excerpt: string
  format: string
  passwordHash: string | null
  revision: number
  legacyAuthorId: string | null
  guid?: string | null
  mimeType?: string | null
  menuOrder?: number
  createdAt: Date
  modifiedAt: Date
  publishedAt: Date | null
  visibility: string
  commentStatus: string
}
export const contentSelection = sql`id,type,status,parent_id as "parentId",author_id as "authorId",legacy_author_id as "legacyAuthorId",
  slug,title,content,format,excerpt,visibility,password_hash as "passwordHash",revision,guid,mime_type as "mimeType",menu_order as "menuOrder",
  published_at as "publishedAt",created_at as "createdAt",modified_at as "modifiedAt",comment_status as "commentStatus"`
const inputSchema = z
  .object({
    id: z.string().min(1).max(32).optional(),
    revision: z.number().int().positive().optional(),
    type: z.string().default('post'),
    status: z.string().default('draft'),
    title: z.string().trim().min(1).max(250),
    slug: z
      .string()
      .max(160)
      .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/)
      .default(''),
    slugMode: z.enum(['auto', 'manual']).default('auto'),
    parentId: z.string().min(1).max(32).nullable().default(null),
    authorId: z.string().min(1).max(128).nullable().optional(),
    content: z.string().max(500000).default(''),
    excerpt: z.string().max(500).default(''),
    visibility: z.enum(['public', 'private', 'password']).default('public'),
    password: z.string().min(8).max(128).optional(),
    publishedAt: z.date().nullable().default(null),
    commentStatus: z.enum(['open', 'closed']).default('open'),
  })
  .strict()

// Drizzle raw execute preserves timestamp strings; decode them at the domain edge.
function contentRow(value: Record<string, unknown>): ContentRecord {
  return {
    ...value,
    createdAt: new Date(value.createdAt as string | Date),
    modifiedAt: new Date(value.modifiedAt as string | Date),
    publishedAt: value.publishedAt === null ? null : new Date(value.publishedAt as string | Date),
  } as ContentRecord
}

export async function recountTerms(tx: CoreTransaction, registry: CoreRegistry) {
  await tx.execute(sql`update cms_term_taxonomy t set count=(
    select count(*)::int from cms_term_relationships r join cms_content c on c.id=r.content_id
    where r.term_taxonomy_id=t.id and c.status in (${sql.join(
      registry.statuses
        .all()
        .filter((status) => status.public)
        .map((status) => sql`${status.name}`),
      sql`,`,
    )}) and c.visibility='public' and c.published_at<=now()
      and c.type in (${sql.join(
        registry.types
          .all()
          .filter((type) => type.public)
          .map((type) => sql`${type.name}`),
        sql`,`,
      )})
  )`)
}

/** Transaction-bound writer. Routes/actions must construct actor from their current session. */
export function createContentService(
  tx: CoreTransaction,
  registry: CoreRegistry,
  actor: Actor | null,
  roles: RoleRegistry,
) {
  async function raw(id: string) {
    const result = await tx.execute(sql`select ${contentSelection} from cms_content where id=${id}`)
    return result.rows[0] ? contentRow(result.rows[0]) : undefined
  }
  async function permission(record: ContentRecord, cap: ObjectCapability) {
    let target = record
    const visited = new Set<string>()
    while (
      target.type === 'revision' ||
      (target.type === 'attachment' && target.status === 'inherit' && target.parentId)
    ) {
      if (visited.has(target.id) || visited.size >= 64 || !target.parentId) return false
      visited.add(target.id)
      const parent = await raw(target.parentId)
      if (!parent) return false
      target = parent
    }
    const definition = registry.types.get(target.type)
    const status = registry.statuses.get(target.status)
    return (
      !!definition &&
      !!status &&
      currentUserCan(
        actor,
        cap,
        {
          ...target,
          capabilityType: definition.capabilityType,
          public: definition.public,
          statusPublic: status.public,
        },
        roles,
      )
    )
  }
  async function validParent(id: string, type: string, parentId: string | null) {
    const definition = registry.types.get(type)!
    if (!parentId) {
      if (type === 'revision') throw new Error('Revisi memerlukan induk.')
      return
    }
    if (!definition.hierarchical && !['revision', 'attachment'].includes(type))
      throw new Error('Jenis konten tidak menerima parent.')
    let current: string | null = parentId
    const visited = new Set([id])
    while (current) {
      if (visited.has(current) || visited.size > 64)
        throw new Error('Parent konten membentuk siklus atau terlalu dalam.')
      visited.add(current)
      const parent = await raw(current)
      if (!parent) throw new Error('Parent konten tidak ditemukan.')
      if (definition.hierarchical && parent.type !== type)
        throw new Error('Parent harus memiliki jenis yang sama.')
      current = parent.parentId
    }
  }
  function safe(record: ContentRecord) {
    const { passwordHash, ...result } = record
    void passwordHash
    return result
  }
  return {
    async can(id: string, cap: ObjectCapability) {
      const row = await raw(id)
      return !!row && (await permission(row, cap))
    },
    async get(id: string, context: 'view' | 'edit' = 'view') {
      z.enum(['view', 'edit']).parse(context)
      const row = await raw(z.string().min(1).max(32).parse(id))
      if (!row) return null
      const definition = registry.types.get(row.type)
      const status = registry.statuses.get(row.status)
      const allowed =
        context === 'view'
          ? !!definition &&
            !!status &&
            currentUserCan(
              null,
              'read_post',
              {
                ...row,
                capabilityType: definition.capabilityType,
                public: definition.public,
                statusPublic: status.public,
              },
              roles,
            )
          : await permission(row, 'edit_post')
      return allowed ? safe(row) : null
    },
    async save(value: unknown) {
      const input = inputSchema.parse(value)
      if (!actor?.active || !roles.get(actor.role)) throw new Error('Izin konten ditolak.')
      await lockContentStructure(tx)
      const id = input.id ?? newId()
      await assertUnmappedCoreWrite(tx, id)
      const old = await raw(id)
      if (input.id && !old) throw new Error('Konten tidak ditemukan.')
      if (old && input.revision !== old.revision)
        throw new Error('Konflik revisi konten; muat ulang sebelum menyimpan.')
      if (old && old.type !== input.type)
        throw new Error('Jenis konten existing tidak dapat diubah.')
      if (old && old.format !== 'html')
        throw new Error(
          'Writer HTML tidak boleh menimpa dokumen blok. Gunakan layanan editor blok.',
        )
      const definition = registry.types.get(input.type)
      const status = registry.statuses.get(input.status)
      if (!definition || !status) throw new Error('Jenis/status konten tidak terdaftar.')
      const owner = input.authorId === undefined ? (old ? old.authorId : actor.id) : input.authorId
      const prospective = {
        type: input.type,
        status: input.status,
        authorId: owner,
        visibility: input.visibility,
        publishedAt: input.publishedAt,
        capabilityType: definition.capabilityType,
        public: definition.public,
        statusPublic: status.public,
      }
      if (old && !(await permission(old, 'edit_post'))) throw new Error('Izin edit konten ditolak.')
      if (input.type !== 'revision' && !currentUserCan(actor, 'edit_post', prospective, roles))
        throw new Error('Izin konten ditolak.')
      if (input.type === 'attachment' && !roles.has(actor.role, 'upload_files'))
        throw new Error('Izin upload attachment ditolak.')
      if (input.status === 'inherit' && !['revision', 'attachment'].includes(input.type))
        throw new Error('Status inherit hanya untuk revisi/attachment.')
      if (status.public || ['future', 'private'].includes(input.status)) {
        const cap = definition.capabilityType === 'page' ? 'publish_pages' : 'publish_posts'
        if (definition.public && !roles.has(actor.role, cap))
          throw new Error('Izin publish konten ditolak.')
      }
      if (input.status === 'trash' && (!old || !(await permission(old, 'delete_post'))))
        throw new Error('Izin trash konten ditolak.')
      if (input.status === 'future' && (!input.publishedAt || input.publishedAt <= new Date()))
        throw new Error('Konten future memerlukan waktu mendatang.')
      if (input.type === 'revision' && input.status !== 'inherit')
        throw new Error('Revisi harus memakai status inherit.')
      await validParent(id, input.type, input.parentId)
      if (
        input.type === 'revision' &&
        !(await permission((await raw(input.parentId!))!, 'edit_post'))
      )
        throw new Error('Izin revisi induk ditolak.')
      if (
        input.type === 'attachment' &&
        input.parentId &&
        !(await permission((await raw(input.parentId))!, 'edit_post'))
      )
        throw new Error('Izin attachment induk ditolak.')
      const html = cleanHtml(input.content)
      if (['post', 'page'].includes(input.type) && status.public && !wordCount(html))
        throw new Error('Isi wajib diisi sebelum publish.')
      const passwordHash =
        input.visibility === 'password'
          ? input.password
            ? await hashPassword(input.password)
            : old?.passwordHash
          : null
      registry.validateContent({
        id,
        type: input.type,
        status: input.status,
        parentId: input.parentId,
        visibility: input.visibility,
        passwordHash,
      })
      let slug =
        input.slug ||
        (old?.slug ?? slugify(input.title).slice(0, 160).replace(/-+$/, '')) ||
        `konten-${id.slice(0, 8)}`
      const allocate =
        definition.public && !['draft', 'auto-draft', 'inherit'].includes(input.status)
      if (allocate) {
        const base = slug
        for (let attempt = 1; attempt <= 100; attempt++) {
          const suffix = attempt === 1 ? '' : `-${attempt}`
          slug = base.slice(0, 160 - suffix.length).replace(/-+$/, '') + suffix
          if (input.type === 'page' && !input.parentId && reservedPageSlugs.has(slug)) {
            if (input.slugMode === 'manual') throw new Error('Slug memakai rute aplikasi.')
            continue
          }
          const collision =
            await tx.execute(sql`select id from cms_content where id<>${id} and type=${input.type}
            and parent_id is not distinct from ${input.parentId} and slug=${slug} and status not in ('draft','auto-draft','inherit','trash') limit 1`)
          if (!collision.rows.length) break
          if (input.slugMode === 'manual' || attempt === 100)
            throw new Error('Slug publik sudah dipakai.')
        }
      }
      const publishedAt = status.public
        ? (input.publishedAt ?? old?.publishedAt ?? new Date())
        : input.publishedAt
      const result =
        await tx.execute(sql`insert into cms_content(id,type,status,parent_id,author_id,slug,title,content,excerpt,visibility,password_hash,published_at,comment_status)
        values(${id},${input.type},${input.status},${input.parentId},${owner},${slug},${input.title},${html},${input.excerpt},${input.visibility},${passwordHash},${publishedAt},${input.commentStatus})
        on conflict(id) do update set status=excluded.status,parent_id=excluded.parent_id,author_id=excluded.author_id,slug=excluded.slug,title=excluded.title,
          content=excluded.content,excerpt=excluded.excerpt,visibility=excluded.visibility,password_hash=excluded.password_hash,published_at=excluded.published_at,
          comment_status=excluded.comment_status,revision=cms_content.revision+1,modified_at=now() returning ${contentSelection}`)
      await recountTerms(tx, registry)
      return safe(contentRow(result.rows[0]!))
    },
    async delete(id: string, revision: number) {
      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, id)
      const old = await raw(id)
      if (!old || !(await permission(old, 'delete_post')))
        throw new Error('Izin hapus konten ditolak.')
      if (old.revision !== revision) throw new Error('Konflik revisi konten.')
      await tx.execute(sql`delete from cms_content where id=${id}`)
      await recountTerms(tx, registry)
    },
  }
}
