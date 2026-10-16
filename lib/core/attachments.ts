import { and, desc, eq, sql } from 'drizzle-orm'
import { newId } from '@/lib/db/ids'
import type { CoreTransaction } from '@/lib/db/meta-store'
import { currentUserCan, type Actor, type RoleRegistry } from './roles'
import { contentSelection, type ContentRecord } from './content'
import { content } from '@/lib/db/core-schema'
import { contentMeta } from '@/lib/db/data-schema'
import type { JsonValue } from './options'
import { media, posts, pages } from '@/lib/db/schema'
import { assertUnmappedCoreWrite, getContentMapping, lockContentStructure } from './content-mapping'

export interface AttachmentMetadata {
  width: number
  height: number
  size: number
  alt?: string
  caption?: string
  description?: string
  blobId: string
  url: string
}

export interface AttachmentRecord extends ContentRecord {
  metadata: AttachmentMetadata
}

function decodeContent(row: Record<string, unknown>): ContentRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt as string | Date),
    modifiedAt: new Date(row.modifiedAt as string | Date),
    publishedAt: row.publishedAt === null ? null : new Date(row.publishedAt as string | Date),
  } as ContentRecord
}

export function createAttachmentService(
  tx: CoreTransaction,
  actor: Actor | null,
  roles: RoleRegistry,
) {
  return {
    /**
     * Creates an attachment content record for a media blob.
     * Follows WordPress pattern: type='attachment', status='inherit'.
     */
    async createAttachment(params: {
      mediaId: string
      parentId?: string | null
      title?: string
      caption?: string
      alt?: string
      description?: string
    }): Promise<AttachmentRecord> {
      if (!actor || !roles.has(actor.role, 'upload_files')) {
        throw new Error('Izin mengunggah berkas media ditolak.')
      }
      await lockContentStructure(tx)
      if (await getContentMapping(tx, 'media', params.mediaId))
        throw new Error(
          'Media legacy masih authoritative; gunakan adaptor media sampai cutover S2B.',
        )

      // 1. Verify media blob exists
      const [mediaRow] = await tx.select().from(media).where(eq(media.id, params.mediaId))

      if (!mediaRow) throw new Error('Berkas media fisik tidak ditemukan.')

      // 2. Validate parent if provided
      if (params.parentId) {
        const [parent] = await tx
          .select({ id: content.id })
          .from(content)
          .where(eq(content.id, params.parentId))
        if (!parent) throw new Error('Konten induk untuk lampiran tidak ditemukan.')
      }

      await lockContentStructure(tx)

      const id = newId()
      const title = params.title?.trim() || mediaRow.name
      const url = `/api/media/${mediaRow.id}`

      // 3. Insert attachment in cms_content
      const res = await tx.execute(sql`
        insert into cms_content (
          id, type, status, parent_id, author_id,
          slug, title, content, format, excerpt, visibility,
          comment_status, mime_type, guid, revision, published_at, created_at, modified_at
        ) values (
          ${id}, 'attachment', 'inherit', ${params.parentId ?? null}, ${actor.id},
          ${mediaRow.id}, ${title}, ${params.description ?? ''}, 'html', ${params.caption ?? ''}, 'public',
          'closed', ${mediaRow.mimeType}, ${url}, 1, now(), now(), now()
        )
        returning ${contentSelection}
      `)

      const rec = decodeContent(res.rows[0]!)

      // 4. Store metadata in cms_content_meta
      const metadata: AttachmentMetadata = {
        width: mediaRow.width,
        height: mediaRow.height,
        size: mediaRow.size,
        alt: params.alt ?? mediaRow.alt,
        caption: params.caption,
        description: params.description,
        blobId: mediaRow.id,
        url,
      }

      await tx.insert(contentMeta).values([
        {
          id: newId(),
          objectId: id,
          key: '_media_blob_id',
          value: mediaRow.id,
        },
        {
          id: newId(),
          objectId: id,
          key: '_wp_attachment_metadata',
          value: metadata as unknown as JsonValue,
        },
      ])

      return {
        ...rec,
        metadata,
      }
    },

    /**
     * Retrieves an attachment record by ID.
     */
    async getAttachment(id: string): Promise<AttachmentRecord | null> {
      const res = await tx.execute(
        sql`select ${contentSelection} from cms_content where id = ${id} and type = 'attachment' limit 1`,
      )
      if (!res.rows[0]) return null

      const rec = decodeContent(res.rows[0])

      const [metaRow] = await tx
        .select({ value: contentMeta.value })
        .from(contentMeta)
        .where(and(eq(contentMeta.objectId, id), eq(contentMeta.key, '_wp_attachment_metadata')))

      const metadata = (metaRow?.value as unknown as AttachmentMetadata) ?? {
        width: 0,
        height: 0,
        size: 0,
        blobId: rec.slug,
        url: rec.guid ?? `/api/media/${rec.slug}`,
      }

      return {
        ...rec,
        metadata,
      }
    },

    /**
     * Lists attachments with optional parentId filtering.
     */
    async listAttachments(
      params: {
        parentId?: string | null
        page?: number
        perPage?: number
      } = {},
    ): Promise<{ items: AttachmentRecord[]; total: number }> {
      const page = Math.max(1, params.page ?? 1)
      const perPage = Math.min(100, Math.max(1, params.perPage ?? 20))
      const offset = (page - 1) * perPage

      const conditions = [eq(content.type, 'attachment')]
      if (params.parentId !== undefined) {
        if (params.parentId === null) {
          conditions.push(sql`${content.parentId} is null`)
        } else {
          conditions.push(eq(content.parentId, params.parentId))
        }
      }

      const whereClause = and(...conditions)

      const [countRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(content)
        .where(whereClause)

      const total = countRes?.count ?? 0

      const rows = await tx
        .select()
        .from(content)
        .where(whereClause)
        .orderBy(desc(content.createdAt))
        .limit(perPage)
        .offset(offset)

      if (!rows.length) return { items: [], total }

      const ids = rows.map((r) => r.id)
      const metas = await tx
        .select({ objectId: contentMeta.objectId, value: contentMeta.value })
        .from(contentMeta)
        .where(
          and(
            sql`${contentMeta.objectId} in (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`,`,
            )})`,
            eq(contentMeta.key, '_wp_attachment_metadata'),
          ),
        )

      const metaMap = new Map<string, AttachmentMetadata>()
      for (const m of metas) {
        metaMap.set(m.objectId, m.value as unknown as AttachmentMetadata)
      }

      const items = rows.map((r) => {
        const decoded = decodeContent(r as Record<string, unknown>)
        const metadata = metaMap.get(r.id) ?? {
          width: 0,
          height: 0,
          size: 0,
          blobId: r.slug,
          url: r.guid ?? `/api/media/${r.slug}`,
        }
        return {
          ...decoded,
          metadata,
        }
      })

      return { items, total }
    },

    /**
     * Updates an attachment's metadata or parent linkage.
     */
    async updateAttachment(
      id: string,
      updates: {
        title?: string
        caption?: string
        alt?: string
        description?: string
        parentId?: string | null
      },
    ): Promise<AttachmentRecord> {
      if (!actor) throw new Error('Izin memperbarui lampiran ditolak.')

      const existing = await this.getAttachment(id)
      if (!existing) throw new Error('Lampiran tidak ditemukan.')

      if (!(await currentUserCan(actor, 'edit_post', existing, roles))) {
        throw new Error('Izin edit lampiran ditolak.')
      }

      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, id)

      const newTitle = updates.title !== undefined ? updates.title.trim() : existing.title
      const newCaption = updates.caption !== undefined ? updates.caption : existing.excerpt
      const newDesc = updates.description !== undefined ? updates.description : existing.content
      const newParentId = updates.parentId !== undefined ? updates.parentId : existing.parentId

      // 1. Update cms_content
      const res = await tx.execute(sql`
        update cms_content
        set title = ${newTitle},
            excerpt = ${newCaption},
            content = ${newDesc},
            parent_id = ${newParentId},
            modified_at = now()
        where id = ${id}
        returning ${contentSelection}
      `)

      const updatedRec = decodeContent(res.rows[0]!)

      // 2. Update metadata in cms_content_meta
      const updatedMeta: AttachmentMetadata = {
        ...existing.metadata,
        alt: updates.alt !== undefined ? updates.alt : existing.metadata.alt,
        caption: newCaption,
        description: newDesc,
      }

      await tx
        .update(contentMeta)
        .set({ value: updatedMeta as unknown as JsonValue })
        .where(and(eq(contentMeta.objectId, id), eq(contentMeta.key, '_wp_attachment_metadata')))

      return {
        ...updatedRec,
        metadata: updatedMeta,
      }
    },

    /**
     * Deletes attachment record, and optionally deletes the underlying media blob if unreferenced.
     */
    async deleteAttachment(id: string, deleteBlob = false): Promise<boolean> {
      if (!actor) throw new Error('Izin menghapus lampiran ditolak.')

      const existing = await this.getAttachment(id)
      if (!existing) throw new Error('Lampiran tidak ditemukan.')

      if (!(await currentUserCan(actor, 'delete_post', existing, roles))) {
        throw new Error('Izin hapus lampiran ditolak.')
      }

      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, id)

      const blobId = existing.metadata.blobId

      // Delete attachment row (cascades to meta)
      await tx.execute(sql`delete from cms_content where id = ${id}`)

      // Optionally delete media blob if not used anywhere else
      if (deleteBlob && blobId) {
        const path = `/api/media/${blobId}`
        const usedPosts = await tx
          .select({ id: posts.id })
          .from(posts)
          .where(sql`${posts.featuredImage} = ${path} or strpos(${posts.content}, ${path}) > 0`)
          .limit(1)

        const usedPages = await tx
          .select({ id: pages.id })
          .from(pages)
          .where(sql`strpos(${pages.content}, ${path}) > 0`)
          .limit(1)

        const usedOtherAttachments = await tx
          .select({ id: content.id })
          .from(content)
          .where(and(eq(content.type, 'attachment'), eq(content.guid, path)))
          .limit(1)

        if (!usedPosts.length && !usedPages.length && !usedOtherAttachments.length) {
          await tx.delete(media).where(eq(media.id, blobId))
        }
      }

      return true
    },
  }
}
