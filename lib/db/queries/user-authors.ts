import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { authors, user } from '@/lib/db/schema'
import { newId } from '@/lib/db/ids'
import { slugify } from '@/lib/utils'

export type CmsTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

// Shared by provisioning and the first article from an existing account.
export async function ensureUserAuthor(tx: CmsTransaction, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-user-authors'))`)
  const [existing] = await tx.select().from(authors).where(eq(authors.userId, userId))
  if (existing) return existing
  const [owner] = await tx.select().from(user).where(eq(user.id, userId))
  if (!owner) throw new Error('Akun tidak ditemukan')
  const id = newId()
  const base = slugify(owner.name).slice(0, 140).replace(/-+$/, '') || `penulis-${id.slice(0, 8)}`
  for (let index = 1; index <= 100; index++) {
    const slug = index === 1 ? base : `${base}-${index}`
    const [created] = await tx
      .insert(authors)
      .values({ id, userId, name: owner.name.slice(0, 160), slug, avatar: owner.image })
      .onConflictDoNothing()
      .returning()
    if (created) return created
  }
  throw new Error('Profil penulis belum dapat dibuat. Coba nama profil lain.')
}

export async function linkUserAuthor(tx: CmsTransaction, userId: string, authorId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-user-authors'))`)
  const [profile] = await tx.select().from(authors).where(eq(authors.id, authorId)).for('update')
  if (!profile || (profile.userId && profile.userId !== userId))
    throw new Error('Profil penulis tidak tersedia atau sudah ditautkan ke akun lain')
  const [current] = await tx.select().from(authors).where(eq(authors.userId, userId))
  if (current && current.id !== authorId) {
    // Attribution follows the profile, never silently transfer existing articles.
    throw new Error('Akun sudah memiliki profil penulis. Profil tertaut tidak dapat diganti.')
  }
  await tx.update(authors).set({ userId }).where(eq(authors.id, authorId))
}
