import { userHasCapability } from '@/lib/core/roles'
import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { requireCapability } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { user, account, session, authors, media, rateLimit } from '@/lib/db/schema'
import { newId } from '@/lib/db/ids'
import { ensureUserAuthor } from './user-authors'

const profileIdentitySchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi').max(120),
  image: z.string().max(2000).default(''),
  bio: z.string().max(5000).default(''),
})

const profileEmailSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi').max(128),
  newEmail: z.email('Email tidak valid').trim().toLowerCase().max(200),
})

const profilePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi').max(128),
  newPassword: z.string().min(12, 'Kata sandi baru minimal 12 karakter').max(128),
  confirmPassword: z.string().min(1, 'Konfirmasi kata sandi wajib diisi').max(128),
})

async function checkPasswordRateLimit(db: ReturnType<typeof getDb>, userId: string) {
  const key = `pwd-check:${userId}`
  const now = Date.now()
  const [row] = await db.select().from(rateLimit).where(eq(rateLimit.key, key))
  if (row && now - row.lastRequest < 60000 && row.count >= 5) {
    throw new Error('Terlalu banyak percobaan kata sandi. Coba lagi dalam satu menit.')
  }
}

async function recordFailedPasswordAttempt(db: ReturnType<typeof getDb>, userId: string) {
  const key = `pwd-check:${userId}`
  const now = Date.now()
  const [row] = await db.select().from(rateLimit).where(eq(rateLimit.key, key))
  if (!row || now - row.lastRequest >= 60000) {
    if (row) {
      await db.update(rateLimit).set({ count: 1, lastRequest: now }).where(eq(rateLimit.key, key))
    } else {
      await db.insert(rateLimit).values({ id: newId(), key, count: 1, lastRequest: now })
    }
  } else {
    await db
      .update(rateLimit)
      .set({ count: row.count + 1, lastRequest: now })
      .where(eq(rateLimit.key, key))
  }
}

async function clearPasswordRateLimit(db: ReturnType<typeof getDb>, userId: string) {
  const key = `pwd-check:${userId}`
  await db.delete(rateLimit).where(eq(rateLimit.key, key))
}

export async function getPersonalProfile() {
  const sessionUser = await requireCapability('edit_profile')
  const db = getDb()
  const [currentUser] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      image: user.image,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, sessionUser.user.id))

  if (!currentUser) throw new Error('Pengguna tidak ditemukan')

  const author = await db.transaction((tx) => ensureUserAuthor(tx, sessionUser.user.id))
  return {
    user: currentUser,
    author,
    canUpload: userHasCapability(sessionUser.user, 'upload_files'),
    roleLabel: sessionUser.user.roleLabel,
  }
}

export async function updatePersonalProfile(data: FormData) {
  const sessionUser = await requireCapability('edit_profile')
  const input = profileIdentitySchema.parse(Object.fromEntries(data))
  const db = getDb()

  await db.transaction(async (tx) => {
    // Coordinate with media deletion and user-authors creation
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-user-authors'))`)

    let imagePath: string | null = null
    if (input.image) {
      const match = /^\/api\/media\/([a-f0-9]{32})(?:[?#]|$)/.exec(input.image)
      const mediaId = match?.[1]
      if (!mediaId) throw new Error('Format gambar tidak valid')
      const [mediaRow] = await tx
        .select({ id: media.id, uploadedBy: media.uploadedBy })
        .from(media)
        .where(eq(media.id, mediaId))
        .for('share')
      if (!mediaRow) throw new Error('Gambar tidak ditemukan')
      if (
        !userHasCapability(sessionUser.user, 'edit_others_posts') &&
        mediaRow.uploadedBy !== sessionUser.user.id
      ) {
        throw new Error('Akses media tidak diizinkan')
      }
      imagePath = `/api/media/${mediaId}`
    }

    const author = await ensureUserAuthor(tx, sessionUser.user.id)

    await tx
      .update(user)
      .set({
        name: input.name,
        image: imagePath,
        updatedAt: new Date(),
      })
      .where(eq(user.id, sessionUser.user.id))

    await tx
      .update(authors)
      .set({
        name: input.name.slice(0, 160),
        avatar: imagePath,
        bio: input.bio || author.bio,
      })
      .where(eq(authors.id, author.id))
  })
}

export async function updatePersonalEmail(data: FormData) {
  const sessionUser = await requireCapability('edit_profile')
  const input = profileEmailSchema.parse(Object.fromEntries(data))
  const db = getDb()
  const userId = sessionUser.user.id

  await checkPasswordRateLimit(db, userId)

  const [credential] = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))

  if (!credential?.password) throw new Error('Autentikasi akun tidak valid')

  const valid = await verifyPassword({
    hash: credential.password,
    password: input.currentPassword,
  })
  if (!valid) {
    await recordFailedPasswordAttempt(db, userId)
    throw new Error('Kata sandi saat ini tidak sesuai')
  }

  await clearPasswordRateLimit(db, userId)

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(78351021)`)

    const [dup] = await tx
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${input.newEmail}`)
      .limit(1)

    if (dup && dup.id !== userId) throw new Error('Email sudah digunakan oleh akun lain')

    await tx
      .update(user)
      .set({ email: input.newEmail, emailVerified: false, updatedAt: new Date() })
      .where(eq(user.id, userId))

    // Revoke all sessions for this user
    await tx.delete(session).where(eq(session.userId, userId))
  })
}

export async function updatePersonalPassword(data: FormData) {
  const sessionUser = await requireCapability('edit_profile')
  const input = profilePasswordSchema.parse(Object.fromEntries(data))
  if (input.newPassword !== input.confirmPassword) {
    throw new Error('Konfirmasi kata sandi tidak cocok')
  }
  const db = getDb()
  const userId = sessionUser.user.id

  await checkPasswordRateLimit(db, userId)

  const [credential] = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))

  if (!credential?.password) throw new Error('Autentikasi akun tidak valid')

  const valid = await verifyPassword({
    hash: credential.password,
    password: input.currentPassword,
  })
  if (!valid) {
    await recordFailedPasswordAttempt(db, userId)
    throw new Error('Kata sandi saat ini tidak sesuai')
  }

  await clearPasswordRateLimit(db, userId)

  const hashedPassword = await hashPassword(input.newPassword)

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(78351021)`)

    await tx
      .update(account)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(account.id, credential.id))

    // Revoke all sessions for this user
    await tx.delete(session).where(eq(session.userId, userId))
  })
}
