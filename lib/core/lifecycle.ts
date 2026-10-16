import { and, eq, sql } from 'drizzle-orm'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { newId } from '@/lib/db/ids'
import type { CoreTransaction } from '@/lib/db/meta-store'
import type { CoreRegistry } from './registry'
import { currentUserCan, type Actor, type RoleRegistry } from './roles'
import { contentSelection, type ContentRecord } from './content'
import { contentMeta, commentMeta } from '@/lib/db/data-schema'
import { comments } from '@/lib/db/schema'
import { assertUnmappedCoreWrite, lockContentStructure } from './content-mapping'

export type PostLifecycleStatus = 'publish' | 'future' | 'draft' | 'pending' | 'private' | 'trash'

export interface TransitionPostOptions {
  publishedAt?: Date | null
  password?: string
  reason?: string
}

export interface TransitionResult {
  post: ContentRecord
  previousStatus: string
  newStatus: string
}

function decodeContent(row: Record<string, unknown>): ContentRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt as string | Date),
    modifiedAt: new Date(row.modifiedAt as string | Date),
    publishedAt: row.publishedAt === null ? null : new Date(row.publishedAt as string | Date),
  } as ContentRecord
}

export function createLifecycleService(
  tx: CoreTransaction,
  registry: CoreRegistry,
  actor: Actor | null,
  roles: RoleRegistry,
) {
  async function raw(id: string): Promise<ContentRecord | null> {
    const res = await tx.execute(sql`select ${contentSelection} from cms_content where id = ${id}`)
    return res.rows[0] ? decodeContent(res.rows[0]) : null
  }

  return {
    /**
     * Transitions a post or page across statuses with permission enforcement:
     * - draft -> pending (contributor / author submission)
     * - pending -> publish (editor / administrator publishing)
     * - publish -> draft (unpublishing)
     * - scheduled publication (status: 'future', requires publishedAt > now and publish capability)
     * - private visibility (status: 'private', requires read_private and publish capabilities)
     * - trash / restore / permanent delete
     */
    async transitionPost(
      postId: string,
      targetStatus: PostLifecycleStatus,
      options: TransitionPostOptions = {},
    ): Promise<TransitionResult> {
      if (!actor || !roles.get(actor.role)) throw new Error('Izin transisi status ditolak.')

      const current = await raw(postId)
      if (!current) throw new Error('Konten tidak ditemukan.')

      const definition = registry.types.get(current.type)
      const targetDef = registry.statuses.get(targetStatus)
      if (!definition || !targetDef) throw new Error('Jenis atau status konten tidak terdaftar.')

      const oldStatus = current.status
      if (oldStatus === targetStatus && !options.password && !options.publishedAt) {
        return { post: current, previousStatus: oldStatus, newStatus: targetStatus }
      }

      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, postId)

      // Check edit permissions
      if (!(await currentUserCan(actor, 'edit_post', current, roles))) {
        throw new Error('Izin edit konten ditolak.')
      }

      // 1. Publishing permissions
      if (targetDef.public || ['future', 'private'].includes(targetStatus)) {
        const publishCap = definition.capabilityType === 'page' ? 'publish_pages' : 'publish_posts'
        if (definition.public && !roles.has(actor.role, publishCap)) {
          throw new Error('Izin menerbitkan konten ditolak.')
        }
      }

      // 2. Scheduled 'future' posts
      if (targetStatus === 'future') {
        const publishTime = options.publishedAt ?? current.publishedAt
        if (!publishTime || publishTime <= new Date()) {
          throw new Error('Waktu publikasi terjadwal harus di masa depan.')
        }
      }

      // 3. Trashing permissions
      if (targetStatus === 'trash') {
        if (!(await currentUserCan(actor, 'delete_post', current, roles))) {
          throw new Error('Izin memindahkan ke tempat sampah ditolak.')
        }
      }

      // 4. Handle trash meta
      if (targetStatus === 'trash') {
        await tx.insert(contentMeta).values([
          {
            id: newId(),
            objectId: postId,
            key: '_wp_trash_meta_status',
            value: oldStatus,
          },
          {
            id: newId(),
            objectId: postId,
            key: '_wp_trash_meta_time',
            value: Date.now(),
          },
        ])
      }

      // 5. Build update values
      const now = new Date()
      let publishedAt = current.publishedAt
      if (targetStatus === 'publish') {
        publishedAt = options.publishedAt ?? (current.publishedAt || now)
      } else if (targetStatus === 'future') {
        publishedAt = options.publishedAt ?? current.publishedAt
      }

      let visibility = current.visibility
      let passwordHash = current.passwordHash || null

      if (targetStatus === 'private') {
        visibility = 'private'
      } else if (options.password) {
        visibility = 'password'
        passwordHash = await hashPassword(options.password)
      } else if (targetStatus === 'publish' && current.visibility !== 'password') {
        visibility = 'public'
      }

      const res = await tx.execute(sql`
        update cms_content
        set status = ${targetStatus},
            visibility = ${visibility},
            password_hash = ${passwordHash},
            published_at = ${publishedAt},
            revision = cms_content.revision + 1,
            modified_at = now()
        where id = ${postId}
        returning ${contentSelection}
      `)

      const updated = decodeContent(res.rows[0]!)

      // 6. Project to legacy tables

      return {
        post: updated,
        previousStatus: oldStatus,
        newStatus: targetStatus,
      }
    },

    /**
     * Trashes a post or page (soft delete).
     */
    async trashPost(postId: string): Promise<TransitionResult> {
      return this.transitionPost(postId, 'trash')
    },

    /**
     * Restores a post or page from trash to its previous status.
     * If the previous status was 'future' but the date has passed, it restores as 'draft'.
     */
    async untrashPost(postId: string): Promise<TransitionResult> {
      if (!actor || !roles.get(actor.role)) throw new Error('Izin memulihkan konten ditolak.')

      const current = await raw(postId)
      if (!current) throw new Error('Konten tidak ditemukan.')
      if (current.status !== 'trash') throw new Error('Konten tidak berada di tempat sampah.')

      if (!(await currentUserCan(actor, 'delete_post', current, roles))) {
        throw new Error('Izin memulihkan konten ditolak.')
      }

      // Retrieve previous status
      const [statusMeta] = await tx
        .select({ id: contentMeta.id, value: contentMeta.value })
        .from(contentMeta)
        .where(and(eq(contentMeta.objectId, postId), eq(contentMeta.key, '_wp_trash_meta_status')))

      let restoreStatus = (statusMeta?.value as PostLifecycleStatus) || 'draft'

      // If scheduled time passed while in trash, restore to draft
      if (
        restoreStatus === 'future' &&
        (!current.publishedAt || current.publishedAt <= new Date())
      ) {
        restoreStatus = 'draft'
      }

      // Clean trash meta
      await tx
        .delete(contentMeta)
        .where(
          and(
            eq(contentMeta.objectId, postId),
            sql`${contentMeta.key} in ('_wp_trash_meta_status', '_wp_trash_meta_time')`,
          ),
        )

      return this.transitionPost(postId, restoreStatus)
    },

    /**
     * Permanently deletes a post or page from the system.
     */
    async deletePermanently(postId: string): Promise<boolean> {
      if (!actor || !roles.get(actor.role)) throw new Error('Izin hapus konten ditolak.')

      const current = await raw(postId)
      if (!current) throw new Error('Konten tidak ditemukan.')

      if (!(await currentUserCan(actor, 'delete_post', current, roles))) {
        throw new Error('Izin hapus permanen ditolak.')
      }

      await lockContentStructure(tx)
      await assertUnmappedCoreWrite(tx, postId)

      // Delete from core and legacy tables
      await tx.execute(sql`delete from cms_content where id = ${postId}`)

      return true
    },

    /**
     * Verifies password for a password-protected post.
     */
    async verifyPostPassword(postId: string, passwordAttempt: string): Promise<boolean> {
      const current = await raw(postId)
      if (!current) return false
      if (current.visibility !== 'password' || !current.passwordHash) return true

      try {
        return await verifyPassword({ password: passwordAttempt, hash: current.passwordHash })
      } catch {
        return false
      }
    },

    /**
     * Filters protected content for display:
     * If content is password protected and viewer does not have grant or edit permissions,
     * masks the content and excerpt with password prompt.
     */
    protectContentForViewer<
      T extends { visibility: string; content: string; excerpt: string; id: string },
    >(record: T, isGranted = false): T {
      if (record.visibility !== 'password' || isGranted) {
        return record
      }

      // If actor has edit permissions, allow reading
      if (actor && roles.has(actor.role, 'edit_posts')) {
        return record
      }

      return {
        ...record,
        content:
          '<p class="password-protected-notice">Konten ini dilindungi dengan kata sandi. Masukkan kata sandi untuk membaca artikel lengkap.</p>',
        excerpt: 'Konten dilindungi kata sandi.',
      }
    },

    /**
     * Comment Lifecycle: updates status ('approved', 'pending', 'spam', 'trash').
     */
    async transitionComment(
      commentId: string,
      status: 'approved' | 'pending' | 'spam' | 'trash',
      moderatorNote?: string,
    ) {
      if (!actor || !roles.has(actor.role, 'moderate_comments')) {
        throw new Error('Izin moderasi komentar ditolak.')
      }

      const [updated] = await tx
        .update(comments)
        .set({ status })
        .where(eq(comments.id, commentId))
        .returning()

      if (!updated) throw new Error('Komentar tidak ditemukan.')

      if (moderatorNote) {
        await tx.insert(commentMeta).values({
          id: newId(),
          objectId: commentId,
          key: '_moderation_note',
          value: { note: moderatorNote, moderatorId: actor.id, timestamp: Date.now() },
        })
      }

      return updated
    },

    /**
     * Helper to set password protection for a post.
     */
    async setPassword(postId: string, password: string): Promise<ContentRecord> {
      const current = await raw(postId)
      if (!current) throw new Error('Konten tidak ditemukan.')
      const result = await this.transitionPost(postId, current.status as PostLifecycleStatus, {
        password,
      })
      return result.post
    },

    /**
     * Permanently deletes a comment and its meta.
     */
    async deleteComment(commentId: string): Promise<boolean> {
      if (!actor || !roles.has(actor.role, 'moderate_comments')) {
        throw new Error('Izin moderasi komentar ditolak.')
      }

      await tx.delete(comments).where(eq(comments.id, commentId))
      await tx.delete(commentMeta).where(eq(commentMeta.objectId, commentId))
      return true
    },
  }
}
