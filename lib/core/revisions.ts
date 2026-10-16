import { and, desc, eq, sql } from 'drizzle-orm'
import { newId } from '@/lib/db/ids'
import type { CoreTransaction } from '@/lib/db/meta-store'
import type { CoreRegistry } from './registry'
import { currentUserCan, type Actor, type RoleRegistry } from './roles'
import { contentSelection, type ContentRecord } from './content'
import { content } from '@/lib/db/core-schema'
import { contentMeta } from '@/lib/db/data-schema'
import type { JsonValue } from './options'
import { assertUnmappedCoreWrite, lockContentStructure } from './content-mapping'

export interface RevisionSnapshot {
  id: string
  postId: string
  authorId: string | null
  authorName?: string
  title: string
  content: string
  excerpt: string
  format: string
  createdAt: Date
  reason?: string
  isAutosave: boolean
}

export interface EditLockStatus {
  locked: boolean
  lockedBy?: string
  lockedAt?: Date
  expiresAt?: Date
  canOverride?: boolean
}

const DEFAULT_REVISION_LIMIT = 10
const EDIT_LOCK_TIMEOUT_SECONDS = 120

function decodeContent(row: Record<string, unknown>): ContentRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt as string | Date),
    modifiedAt: new Date(row.modifiedAt as string | Date),
    publishedAt: row.publishedAt === null ? null : new Date(row.publishedAt as string | Date),
  } as ContentRecord
}

export function createRevisionService(
  tx: CoreTransaction,
  registry: CoreRegistry,
  actor: Actor | null,
  roles: RoleRegistry,
) {
  async function getParentRecord(postId: string): Promise<ContentRecord | null> {
    const res = await tx.execute(
      sql`select ${contentSelection} from cms_content where id = ${postId} and type in ('post', 'page') limit 1`,
    )
    return res.rows[0] ? decodeContent(res.rows[0]) : null
  }

  return {
    /**
     * Creates a historical revision snapshot for a post or page.
     * WordPress stores revisions as posts with type 'revision' and status 'inherit'.
     */
    async createRevision(
      postId: string,
      optionsOrReason?: string | { reason?: string; limit?: number },
      limitArg = DEFAULT_REVISION_LIMIT,
    ): Promise<RevisionSnapshot> {
      const reason = typeof optionsOrReason === 'string' ? optionsOrReason : optionsOrReason?.reason
      const limit =
        typeof optionsOrReason === 'object' && optionsOrReason?.limit !== undefined
          ? optionsOrReason.limit
          : limitArg
      if (!actor || !roles.get(actor.role)) throw new Error('Izin revisi ditolak.')

      const parent = await getParentRecord(postId)
      if (!parent) throw new Error('Konten induk tidak ditemukan.')

      const definition = registry.types.get(parent.type)
      if (
        !definition ||
        !currentUserCan(
          actor,
          'edit_post',
          { ...parent, capabilityType: definition.capabilityType },
          roles,
        )
      ) {
        throw new Error('Izin membuat revisi ditolak.')
      }

      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, postId)

      const revId = newId()
      const slug = `${parent.id}-revision-${parent.revision}`

      // 1. Insert revision row in cms_content
      await tx.execute(sql`
        insert into cms_content (
          id, type, status, parent_id, author_id, legacy_author_id,
          slug, title, content, format, excerpt, visibility,
          comment_status, revision, published_at, created_at, modified_at
        ) values (
          ${revId}, 'revision', 'inherit', ${parent.id}, ${actor.id}, ${parent.legacyAuthorId},
          ${slug}, ${parent.title}, ${parent.content}, ${parent.format}, ${parent.excerpt}, 'public',
          'closed', ${parent.revision}, ${parent.modifiedAt}, now(), now()
        )
      `)

      // 2. Snapshot metadata
      const currentMeta = await tx
        .select({ key: contentMeta.key, value: contentMeta.value })
        .from(contentMeta)
        .where(eq(contentMeta.objectId, parent.id))

      const metaMap: Record<string, unknown> = {}
      for (const m of currentMeta) {
        if (!m.key.startsWith('_revision_') && !m.key.startsWith('_edit_lock')) {
          metaMap[m.key] = m.value
        }
      }

      const snapshotData = {
        title: parent.title,
        content: parent.content,
        excerpt: parent.excerpt,
        format: parent.format,
        meta: metaMap,
        reason: reason || undefined,
      }

      await tx.insert(contentMeta).values({
        id: newId(),
        objectId: revId,
        key: '_revision_snapshot',
        value: snapshotData as unknown as JsonValue,
      })

      // 3. Purge oldest revisions beyond limit (excluding autosaves)
      if (limit > 0) {
        const existingRevs = await tx
          .select({ id: content.id })
          .from(content)
          .where(
            and(
              eq(content.parentId, parent.id),
              eq(content.type, 'revision'),
              sql`not (${content.slug} like '%-autosave-%')`,
            ),
          )
          .orderBy(desc(content.createdAt))

        if (existingRevs.length > limit) {
          const toDelete = existingRevs.slice(limit).map((r) => r.id)
          for (const oldId of toDelete) {
            await tx.delete(content).where(eq(content.id, oldId))
          }
        }
      }

      return {
        id: revId,
        postId: parent.id,
        authorId: actor.id,
        title: parent.title,
        content: parent.content,
        excerpt: parent.excerpt,
        format: parent.format,
        createdAt: new Date(),
        reason,
        isAutosave: false,
      }
    },

    /**
     * Lists revisions for a given post/page, ordered from newest to oldest.
     */
    async listRevisions(postId: string): Promise<RevisionSnapshot[]> {
      const parent = await getParentRecord(postId)
      if (!parent) return []

      const definition = registry.types.get(parent.type)
      if (
        !definition ||
        !currentUserCan(
          actor,
          'edit_post',
          { ...parent, capabilityType: definition.capabilityType },
          roles,
        )
      ) {
        throw new Error('Izin melihat riwayat revisi ditolak.')
      }

      const rows = await tx
        .select({
          id: content.id,
          postId: content.parentId,
          authorId: content.authorId,
          title: content.title,
          content: content.content,
          excerpt: content.excerpt,
          format: content.format,
          slug: content.slug,
          createdAt: content.createdAt,
        })
        .from(content)
        .where(and(eq(content.parentId, postId), eq(content.type, 'revision')))
        .orderBy(desc(content.createdAt))

      return rows.map((r) => ({
        id: r.id,
        postId: r.postId!,
        authorId: r.authorId,
        title: r.title,
        content: r.content,
        excerpt: r.excerpt,
        format: r.format,
        createdAt: r.createdAt,
        isAutosave: r.slug.includes('-autosave-'),
      }))
    },

    /**
     * Retrieves a single revision with full content and metadata snapshot.
     */
    async getRevision(revisionId: string): Promise<RevisionSnapshot | null> {
      const [rev] = await tx
        .select()
        .from(content)
        .where(and(eq(content.id, revisionId), eq(content.type, 'revision')))

      if (!rev || !rev.parentId) return null

      const parent = await getParentRecord(rev.parentId)
      if (!parent) return null

      const definition = registry.types.get(parent.type)
      if (
        !definition ||
        !currentUserCan(
          actor,
          'edit_post',
          { ...parent, capabilityType: definition.capabilityType },
          roles,
        )
      ) {
        throw new Error('Izin membaca revisi ditolak.')
      }

      const [metaRow] = await tx
        .select({ value: contentMeta.value })
        .from(contentMeta)
        .where(and(eq(contentMeta.objectId, rev.id), eq(contentMeta.key, '_revision_snapshot')))

      const snapshot = (metaRow?.value as Record<string, unknown>) ?? {}

      return {
        id: rev.id,
        postId: rev.parentId,
        authorId: rev.authorId,
        title: rev.title,
        content: rev.content,
        excerpt: rev.excerpt,
        format: rev.format,
        createdAt: rev.createdAt,
        reason: (snapshot.reason as string) || undefined,
        isAutosave: rev.slug.includes('-autosave-'),
      }
    },

    /**
     * Restores a post/page to a past revision.
     * Keeps attribution, increments revision, and creates a restore backup first.
     */
    async restoreRevision(postId: string, revisionId: string): Promise<ContentRecord> {
      if (!actor || !roles.get(actor.role)) throw new Error('Izin memulihkan revisi ditolak.')

      const parent = await getParentRecord(postId)
      if (!parent) throw new Error('Konten induk tidak ditemukan.')

      const definition = registry.types.get(parent.type)
      if (
        !definition ||
        !currentUserCan(
          actor,
          'edit_post',
          { ...parent, capabilityType: definition.capabilityType },
          roles,
        )
      ) {
        throw new Error('Izin memulihkan revisi ditolak.')
      }

      const [rev] = await tx
        .select()
        .from(content)
        .where(
          and(
            eq(content.id, revisionId),
            eq(content.parentId, postId),
            eq(content.type, 'revision'),
          ),
        )

      if (!rev) throw new Error('Revisi tidak ditemukan untuk konten ini.')

      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, postId)

      // 1. Create a snapshot of current state before overwrite
      await this.createRevision(
        postId,
        `Otomatis sebelum memulihkan revisi ${revisionId.slice(0, 8)}`,
      )

      // 2. Restore content fields
      const res = await tx.execute(sql`
        update cms_content
        set title = ${rev.title},
            content = ${rev.content},
            excerpt = ${rev.excerpt},
            format = ${rev.format},
            revision = cms_content.revision + 1,
            modified_at = now()
        where id = ${postId}
        returning ${contentSelection}
      `)

      const updated = decodeContent(res.rows[0]!)

      return updated
    },

    /**
     * Saves an autosave revision per user.
     * WordPress maintains at most 1 autosave per user per post.
     */
    async saveAutosave(
      postId: string,
      data: { title: string; content: string; excerpt?: string },
    ): Promise<RevisionSnapshot> {
      if (!actor || !roles.get(actor.role)) throw new Error('Izin autosave ditolak.')

      const parent = await getParentRecord(postId)
      if (!parent) throw new Error('Konten induk tidak ditemukan.')

      const definition = registry.types.get(parent.type)
      if (
        !definition ||
        !currentUserCan(
          actor,
          'edit_post',
          { ...parent, capabilityType: definition.capabilityType },
          roles,
        )
      ) {
        throw new Error('Izin menyimpan autosave ditolak.')
      }

      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, postId)

      const autosaveSlug = `${parent.id}-autosave-${actor.id}`

      const [existingAutosave] = await tx
        .select({ id: content.id })
        .from(content)
        .where(
          and(
            eq(content.parentId, parent.id),
            eq(content.type, 'revision'),
            eq(content.slug, autosaveSlug),
          ),
        )

      const id = existingAutosave?.id ?? newId()
      const title = data.title.trim() || parent.title
      const excerpt = data.excerpt !== undefined ? data.excerpt : parent.excerpt

      if (existingAutosave) {
        await tx.execute(sql`
          update cms_content
          set title = ${title},
              content = ${data.content},
              excerpt = ${excerpt},
              modified_at = now()
          where id = ${id}
        `)
      } else {
        await tx.execute(sql`
          insert into cms_content (
            id, type, status, parent_id, author_id, legacy_author_id,
            slug, title, content, format, excerpt, visibility,
            comment_status, revision, published_at, created_at, modified_at
          ) values (
            ${id}, 'revision', 'inherit', ${parent.id}, ${actor.id}, ${parent.legacyAuthorId},
            ${autosaveSlug}, ${title}, ${data.content}, ${parent.format}, ${excerpt}, 'public',
            'closed', ${parent.revision}, now(), now(), now()
          )
        `)
      }

      return {
        id,
        postId: parent.id,
        authorId: actor.id,
        title,
        content: data.content,
        excerpt,
        format: parent.format,
        createdAt: new Date(),
        isAutosave: true,
      }
    },

    /**
     * Gets user's autosave if it has modifications newer than the post.
     */
    async getAutosave(postId: string): Promise<RevisionSnapshot | null> {
      if (!actor) return null

      const parent = await getParentRecord(postId)
      if (!parent) return null

      const autosaveSlug = `${parent.id}-autosave-${actor.id}`

      const [rev] = await tx
        .select()
        .from(content)
        .where(
          and(
            eq(content.parentId, parent.id),
            eq(content.type, 'revision'),
            eq(content.slug, autosaveSlug),
          ),
        )

      if (!rev) return null

      // Only return if autosave is newer than parent modification
      if (rev.modifiedAt.getTime() <= parent.modifiedAt.getTime()) {
        return null
      }

      return {
        id: rev.id,
        postId: parent.id,
        authorId: rev.authorId,
        title: rev.title,
        content: rev.content,
        excerpt: rev.excerpt,
        format: rev.format,
        createdAt: rev.modifiedAt,
        isAutosave: true,
      }
    },

    /**
     * Acquires or checks an edit lock (analogous to WordPress wp_set_post_lock).
     */
    async acquireEditLock(
      postId: string,
      ttlSeconds = EDIT_LOCK_TIMEOUT_SECONDS,
    ): Promise<EditLockStatus> {
      if (!actor || !roles.get(actor.role)) throw new Error('Izin kunci edit ditolak.')
      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, postId)

      const parent = await getParentRecord(postId)
      if (!parent) throw new Error('Konten tidak ditemukan.')

      const [lockRow] = await tx
        .select({ id: contentMeta.id, value: contentMeta.value })
        .from(contentMeta)
        .where(and(eq(contentMeta.objectId, postId), eq(contentMeta.key, '_edit_lock')))

      const lockData = (lockRow?.value as { userId?: string; lockedAt?: number }) ?? {}
      const nowMs = Date.now()
      const isLockedByOther =
        lockData.userId &&
        lockData.userId !== actor.id &&
        lockData.lockedAt &&
        nowMs - lockData.lockedAt < ttlSeconds * 1000

      if (isLockedByOther) {
        const canOverride = roles.has(actor.role, 'edit_others_posts')
        return {
          locked: true,
          lockedBy: lockData.userId,
          lockedAt: new Date(lockData.lockedAt!),
          expiresAt: new Date(lockData.lockedAt! + ttlSeconds * 1000),
          canOverride,
        }
      }

      const lockPayload = { userId: actor.id, lockedAt: nowMs }

      if (lockRow) {
        await tx
          .update(contentMeta)
          .set({ value: lockPayload as unknown as JsonValue })
          .where(eq(contentMeta.id, lockRow.id))
      } else {
        await tx.insert(contentMeta).values({
          id: newId(),
          objectId: postId,
          key: '_edit_lock',
          value: lockPayload as unknown as JsonValue,
        })
      }

      return {
        locked: false,
        lockedBy: actor.id,
        lockedAt: new Date(nowMs),
        expiresAt: new Date(nowMs + ttlSeconds * 1000),
      }
    },

    /**
     * Checks if a post is currently locked by another user.
     */
    async checkEditLock(
      postId: string,
      ttlSeconds = EDIT_LOCK_TIMEOUT_SECONDS,
    ): Promise<EditLockStatus> {
      const [lockRow] = await tx
        .select({ value: contentMeta.value })
        .from(contentMeta)
        .where(and(eq(contentMeta.objectId, postId), eq(contentMeta.key, '_edit_lock')))

      if (!lockRow) return { locked: false }

      const lockData = (lockRow.value as { userId?: string; lockedAt?: number }) ?? {}
      const nowMs = Date.now()
      const isExpired = !lockData.lockedAt || nowMs - lockData.lockedAt >= ttlSeconds * 1000

      if (isExpired) return { locked: false }

      const isMe = actor && lockData.userId === actor.id
      return {
        locked: !isMe,
        lockedBy: lockData.userId,
        lockedAt: new Date(lockData.lockedAt!),
        expiresAt: new Date(lockData.lockedAt! + ttlSeconds * 1000),
        canOverride: actor ? roles.has(actor.role, 'edit_others_posts') : false,
      }
    },

    /**
     * Releases edit lock held by current user or an administrator.
     */
    async releaseEditLock(postId: string): Promise<boolean> {
      if (!actor) return false
      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, postId)

      const [lockRow] = await tx
        .select({ id: contentMeta.id, value: contentMeta.value })
        .from(contentMeta)
        .where(and(eq(contentMeta.objectId, postId), eq(contentMeta.key, '_edit_lock')))

      if (!lockRow) return true

      const lockData = (lockRow.value as { userId?: string }) ?? {}
      if (lockData.userId === actor.id || roles.has(actor.role, 'edit_others_posts')) {
        await tx.delete(contentMeta).where(eq(contentMeta.id, lockRow.id))
        return true
      }

      return false
    },
  }
}
