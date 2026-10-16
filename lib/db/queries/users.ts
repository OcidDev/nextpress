import { canonicalRole, roleNameSchema } from '@/lib/core/roles'
import { getRequestRoles } from '@/lib/core/roles-server'
import 'server-only'
import { and, asc, count, desc, eq, isNull, or, ilike, ne, sql } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'
import { requireCapability } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { user, account, session, authors, media } from '@/lib/db/schema'
import { newId } from '@/lib/db/ids'
import { ensureUserAuthor, linkUserAuthor } from './user-authors'
import { customSortParameters, listParameters, sortParameters, type ListSearch } from './admin-list'

const inputSchema = z.object({
  id: z.string().max(128).default(''),
  name: z.string().trim().min(1, 'Nama wajib diisi').max(120),
  email: z.email('Email tidak valid').trim().toLowerCase().max(200),
  role: z
    .preprocess(
      (val) => (val === '' || val === undefined || val === null ? 'author' : val),
      roleNameSchema.transform(canonicalRole),
    )
    .default('author'),
  active: z
    .preprocess(
      (val) => (val === '' || val === undefined || val === null ? 'true' : val),
      z.enum(['true', 'false']),
    )
    .transform((value) => value === 'true'),
  password: z
    .string()
    .max(128)
    .default('')
    .refine((value) => !value || value.length >= 12, 'Kata sandi minimal 12 karakter'),
  profileId: z.string().max(32).default(''),
  image: z.string().max(2000).default(''),
  bio: z.string().max(5000).default(''),
  slug: z.string().max(160).default(''),
  authorRole: z.string().max(80).default(''),
  verified: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  twitter: z.string().max(200).default(''),
  instagram: z.string().max(200).default(''),
  facebook: z.string().max(200).default(''),
  website: z.string().max(200).default(''),
})

const fields = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  image: user.image,
  createdAt: user.createdAt,
}

export async function listedUsers(search: ListSearch) {
  await requireCapability('list_users')
  const params = listParameters(search, ['active', 'inactive'])
  const { sort, dir } = sortParameters(
    search,
    ['name', 'email', 'role', 'status', 'createdAt'] as const,
    'createdAt',
    'desc',
  )
  params.sort = sort
  params.dir = dir

  const rawRole = Array.isArray(search.role) ? search.role[0] : search.role
  const roles = await getRequestRoles()
  const role = roles.get(rawRole || '') ? canonicalRole(rawRole!) : ''
  const pattern = `%${params.q.replace(/[\\%_]/g, '\\$&')}%`
  const where = and(
    params.q ? or(ilike(user.name, pattern), ilike(user.email, pattern)) : undefined,
    params.status ? eq(user.active, params.status === 'active') : undefined,
    role
      ? role === 'administrator'
        ? or(eq(user.role, 'admin'), eq(user.role, 'administrator'))
        : eq(user.role, role)
      : undefined,
  )
  const db = getDb()
  const [total] = await db.select({ value: count() }).from(user).where(where)
  const pageCount = Math.max(1, Math.ceil(total!.value / 20))
  const page = Math.min(params.page, pageCount)

  const orderClauses = []
  if (sort === 'name') {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${user.name})`) : asc(sql`lower(${user.name})`),
    )
  } else if (sort === 'email') {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${user.email})`) : asc(sql`lower(${user.email})`),
    )
  } else if (sort === 'role') {
    orderClauses.push(dir === 'desc' ? desc(user.role) : asc(user.role))
  } else if (sort === 'status') {
    orderClauses.push(dir === 'desc' ? desc(user.active) : asc(user.active))
  } else {
    orderClauses.push(dir === 'asc' ? asc(user.createdAt) : desc(user.createdAt))
  }
  orderClauses.push(desc(user.id))

  const rows = await db
    .select(fields)
    .from(user)
    .where(where)
    .orderBy(...orderClauses)
    .limit(20)
    .offset((page - 1) * 20)
  return {
    rows,
    roles: roles.all(),
    params: { ...params, role, sort, dir },
    total: total!.value,
    page,
    pageCount,
  }
}

export async function userEditor(id?: string) {
  await requireCapability('edit_users')
  const db = getDb()
  const [current] = id ? await db.select(fields).from(user).where(eq(user.id, id)) : []
  if (id && !current) return null
  const [linkedAuthor] = id ? await db.select().from(authors).where(eq(authors.userId, id)) : []
  const profiles = await db
    .select({ id: authors.id, name: authors.name, userId: authors.userId })
    .from(authors)
    .where(id ? or(isNull(authors.userId), eq(authors.userId, id)) : isNull(authors.userId))
    .orderBy(authors.name)
  return {
    roles: (await getRequestRoles()).all(),
    user: current ? { ...current, role: canonicalRole(current.role) } : current,
    author: linkedAuthor,
    profiles,
    profileId: profiles.find((profile) => profile.userId === id)?.id || '',
  }
}

export async function saveUserData(data: FormData) {
  const admin = await requireCapability('edit_users')
  const input = inputSchema.parse(Object.fromEntries(data))
  const roles = await getRequestRoles()
  if (!roles.get(input.role)) throw new Error('Peran tidak terdaftar.')
  if (
    canonicalRole(admin.user.role) !== 'administrator' &&
    roles.get(input.role)!.capabilities.some((cap) => !admin.user.capabilities.includes(cap))
  )
    throw new Error('Tidak dapat memberikan izin yang lebih tinggi dari izin sendiri.')
  if (!input.id && !input.password) throw new Error('Kata sandi wajib diisi untuk akun baru')
  const password = input.password ? await hashPassword(input.password) : undefined
  const id = input.id || newId()
  await getDb().transaction(async (tx) => {
    // Coordinate with appearance/media locks and account lock
    await tx.execute(sql`select pg_advisory_xact_lock(78351021)`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)

    const [actor] = await tx
      .select({ role: user.role, active: user.active })
      .from(user)
      .where(eq(user.id, admin.user.id))
    if (!actor?.active || !roles.has(actor.role, 'edit_users'))
      throw new Error('Akses admin diperlukan')
    const [old] = input.id ? await tx.select().from(user).where(eq(user.id, id)).for('update') : []
    if (input.id && !old) throw new Error('Akun tidak ditemukan')
    if (
      old &&
      canonicalRole(old.role) === 'administrator' &&
      old.active &&
      (input.role !== 'administrator' || !input.active)
    ) {
      const [admins] = await tx
        .select({ value: count() })
        .from(user)
        .where(
          and(or(eq(user.role, 'admin'), eq(user.role, 'administrator')), eq(user.active, true)),
        )
      if (admins!.value <= 1)
        throw new Error('Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan perannya')
    }
    const [duplicate] = await tx
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${input.email}`)
      .limit(1)
    if (duplicate && duplicate.id !== id) throw new Error('Email sudah digunakan oleh akun lain')

    let imagePath: string | null = null
    if (input.image) {
      const match = /^\/api\/media\/([a-f0-9]{32})(?:[?#]|$)/.exec(input.image)
      const mediaId = match?.[1]
      if (mediaId) {
        const [foundMedia] = await tx
          .select({ id: media.id })
          .from(media)
          .where(eq(media.id, mediaId))
          .for('share')
        if (foundMedia) imagePath = `/api/media/${mediaId}`
      }
    }

    const values = {
      name: input.name,
      email: input.email,
      role: input.role,
      active: input.active,
      image: imagePath || (input.image ? null : old?.image || null),
      updatedAt: new Date(),
    }
    if (old)
      await tx
        .update(user)
        .set({ ...values, ...(old.email !== input.email ? { emailVerified: false } : {}) })
        .where(eq(user.id, id))
    else await tx.insert(user).values({ id, ...values })

    if (password) {
      const [credential] = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, id), eq(account.providerId, 'credential')))
      if (credential)
        await tx
          .update(account)
          .set({ password, updatedAt: new Date() })
          .where(eq(account.id, credential.id))
      else
        await tx
          .insert(account)
          .values({ id: newId(), userId: id, accountId: id, providerId: 'credential', password })
    }

    let authorRow: typeof authors.$inferSelect | undefined
    if (input.profileId) {
      await linkUserAuthor(tx, id, input.profileId)
      const [linked] = await tx.select().from(authors).where(eq(authors.id, input.profileId))
      authorRow = linked
    } else {
      authorRow = await ensureUserAuthor(tx, id)
    }

    if (authorRow) {
      let slugToSet = authorRow.slug
      if (input.slug && input.slug !== authorRow.slug) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
          throw new Error('Format slug tidak sah. Gunakan huruf kecil, angka, dan tanda hubung.')
        }
        const [taken] = await tx
          .select({ id: authors.id })
          .from(authors)
          .where(and(eq(authors.slug, input.slug), ne(authors.id, authorRow.id)))
          .limit(1)
        if (taken) throw new Error('Slug penulis sudah digunakan')
        slugToSet = input.slug
      }

      await tx
        .update(authors)
        .set({
          name: !input.id && input.profileId ? authorRow.name : input.name.slice(0, 160),
          avatar: values.image || authorRow.avatar,
          bio: input.bio || authorRow.bio,
          role: input.authorRole || authorRow.role,
          verified: input.verified,
          slug: slugToSet,
          social: {
            twitter: input.twitter || authorRow.social?.twitter || undefined,
            instagram: input.instagram || authorRow.social?.instagram || undefined,
            facebook: input.facebook || authorRow.social?.facebook || undefined,
            website: input.website || authorRow.social?.website || undefined,
          },
        })
        .where(eq(authors.id, authorRow.id))
    }

    if (
      old &&
      (!input.active ||
        canonicalRole(old.role) !== input.role ||
        password ||
        old.email !== input.email)
    )
      await tx.delete(session).where(eq(session.userId, id))
  })
  return id
}

export async function listLegacyAuthors(search?: ListSearch) {
  await requireCapability('list_users')
  const db = getDb()
  const { sort, dir } = customSortParameters(
    search || {},
    ['name', 'slug', 'verified'] as const,
    'name',
    'asc',
    'lsort',
    'ldir',
  )

  const orderClauses = []
  if (sort === 'slug') {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${authors.slug})`) : asc(sql`lower(${authors.slug})`),
    )
  } else if (sort === 'verified') {
    orderClauses.push(dir === 'desc' ? desc(authors.verified) : asc(authors.verified))
  } else {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${authors.name})`) : asc(sql`lower(${authors.name})`),
    )
  }
  orderClauses.push(asc(authors.id))

  const rows = await db
    .select({
      id: authors.id,
      name: authors.name,
      slug: authors.slug,
      bio: authors.bio,
      verified: authors.verified,
      role: authors.role,
      avatar: authors.avatar,
      createdAt: authors.createdAt,
    })
    .from(authors)
    .where(isNull(authors.userId))
    .orderBy(...orderClauses)
  return { rows, sort, dir }
}

export async function legacyAuthorEditor(id: string) {
  await requireCapability('edit_users')
  const db = getDb()
  const [profile] = await db
    .select()
    .from(authors)
    .where(and(eq(authors.id, id), isNull(authors.userId)))
  if (!profile) return null

  const eligibleUsers = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(sql`not exists (select 1 from ${authors} where ${authors.userId} = ${user.id})`)
    .orderBy(user.name)

  return { profile, eligibleUsers }
}

const legacyAuthorInputSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().trim().min(1, 'Nama wajib diisi').max(120),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Format slug tidak sah'),
  bio: z.string().max(5000).default(''),
  authorRole: z.string().max(80).default(''),
  avatar: z.string().max(2000).default(''),
  verified: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  twitter: z.string().max(200).default(''),
  instagram: z.string().max(200).default(''),
  facebook: z.string().max(200).default(''),
  website: z.string().max(200).default(''),
  userId: z.string().max(128).default(''),
})

export async function saveLegacyAuthorData(data: FormData) {
  await requireCapability('edit_users')
  const input = legacyAuthorInputSchema.parse(Object.fromEntries(data))
  const db = getDb()

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-user-authors'))`)
    const [profile] = await tx
      .select()
      .from(authors)
      .where(and(eq(authors.id, input.id), isNull(authors.userId)))
      .for('update')
    if (!profile) throw new Error('Profil lama tidak ditemukan atau sudah ditautkan ke akun')

    const [slugDuplicate] = await tx
      .select({ id: authors.id })
      .from(authors)
      .where(and(eq(authors.slug, input.slug), ne(authors.id, input.id)))
      .limit(1)
    if (slugDuplicate) throw new Error('Slug sudah digunakan oleh profil lain')

    let imagePath: string | null = null
    if (input.avatar) {
      const match = /^\/api\/media\/([a-f0-9]{32})(?:[?#]|$)/.exec(input.avatar)
      const mediaId = match?.[1]
      if (mediaId) {
        const [foundMedia] = await tx
          .select({ id: media.id })
          .from(media)
          .where(eq(media.id, mediaId))
          .for('share')
        if (foundMedia) imagePath = `/api/media/${mediaId}`
      }
    }

    if (input.userId) {
      const [targetUser] = await tx.select().from(user).where(eq(user.id, input.userId))
      if (!targetUser) throw new Error('Akun pengguna tidak ditemukan')
      const [existingUserAuthor] = await tx
        .select({ id: authors.id })
        .from(authors)
        .where(eq(authors.userId, input.userId))
      if (existingUserAuthor) throw new Error('Pengguna tersebut sudah memiliki profil penulis')
      await tx.update(authors).set({ userId: input.userId }).where(eq(authors.id, input.id))
      // Sync target user name and photo if they don't have one
      await tx
        .update(user)
        .set({
          name: input.name,
          image: imagePath || targetUser.image,
          updatedAt: new Date(),
        })
        .where(eq(user.id, input.userId))
    }

    await tx
      .update(authors)
      .set({
        name: input.name,
        slug: input.slug,
        bio: input.bio || null,
        role: input.authorRole || null,
        avatar: imagePath || null,
        verified: input.verified,
        social: {
          twitter: input.twitter || undefined,
          instagram: input.instagram || undefined,
          facebook: input.facebook || undefined,
          website: input.website || undefined,
        },
      })
      .where(eq(authors.id, input.id))
  })
}
