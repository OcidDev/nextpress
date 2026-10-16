import { lockContentStructure } from '@/lib/core/content-mapping'
import { rememberPostRoutes, validatePublicPermalinks } from '@/lib/content/permalink-server'
import { getSettings } from './settings'
import 'server-only'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireCapability, requireCmsUser } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { authors, categories, postCategories } from '@/lib/db/schema'
import { userHasCapability } from '@/lib/core/roles'
import { slugify } from '@/lib/utils'
import { newId } from './admin-content'
import { sortParameters, type ListSearch } from './admin-list'
import {
  projectCategoryToCore,
  removeCategoryProjection,
  projectPostCategoriesToCore,
} from '@/lib/core/content-projection'
import { createPostgresOptionStore } from '@/lib/db/core-store'
import { createOptionsApi } from '@/lib/core/options'
import { createCmsOptionRegistry } from '@/lib/core/option-definitions'
import { settingsSchema } from '@/lib/content/settings'
import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_CATEGORY_SLUG,
  DEFAULT_CATEGORY_NAME,
  MAX_CATEGORY_DEPTH,
  buildCategoryTree,
  type CategoryNode,
} from '@/lib/core/category-tree'
export { DEFAULT_CATEGORY_SLUG, DEFAULT_CATEGORY_NAME } from '@/lib/core/category-tree'

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

const inputSchema = z.object({
  id: z.string().max(32),
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(5000),
  parentId: z
    .string()
    .max(32)
    .optional()
    .default('')
    .transform((value) => value.trim() || null),
})

/**
 * Serialisasi seluruh perubahan struktur kategori. Nama lock sengaja sama
 * dengan generic term service agar quick-add, seed, dan save tidak saling
 * mendahului dan membuat term ganda atau bentrok slug.
 */
export async function lockCategoryStructure(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-taxonomy-structure'))`)
}

/** Capability term WordPress: hanya peran dengan manage_categories boleh menulis. */
async function requireTermWriter() {
  const session = await requireCmsUser()
  if (!userHasCapability(session.user, 'manage_categories'))
    throw new Error('Izin kategori ditolak. Hubungi editor atau administrator.')
  return session
}

export async function listTaxonomy(
  kind: 'authors',
  search?: ListSearch,
): Promise<{ id: string; name: string; slug: string; description: string; verified: boolean }[]>
export async function listTaxonomy(
  kind: 'categories',
  search?: ListSearch,
): Promise<{
  rows: Array<{
    id: string
    name: string
    slug: string
    description: string
    parentId: string | null
  }>
  sort: 'name' | 'slug'
  dir: 'asc' | 'desc'
}>
export async function listTaxonomy(
  kind: 'authors' | 'categories',
  search?: ListSearch,
): Promise<
  | { id: string; name: string; slug: string; description: string; verified: boolean }[]
  | {
      rows: Array<{
        id: string
        name: string
        slug: string
        description: string
        parentId: string | null
      }>
      sort: 'name' | 'slug'
      dir: 'asc' | 'desc'
    }
> {
  await requireCapability('manage_categories')
  if (kind === 'authors') {
    return (await getDb().select().from(authors).orderBy(authors.name)).map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      description: a.bio || '',
      verified: a.verified,
    }))
  }
  const { sort, dir } = sortParameters(search || {}, ['name', 'slug'] as const, 'name', 'asc')
  const orderExpr =
    sort === 'slug'
      ? dir === 'desc'
        ? desc(sql`lower(${categories.slug})`)
        : asc(sql`lower(${categories.slug})`)
      : dir === 'desc'
        ? desc(sql`lower(${categories.name})`)
        : asc(sql`lower(${categories.name})`)

  const rows = (
    await getDb()
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        parentId: categories.parentId,
      })
      .from(categories)
      .orderBy(orderExpr, asc(categories.id))
  ).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description || '',
    parentId: c.parentId,
  }))
  return { rows, sort, dir }
}

export async function listCategoryTree(): Promise<CategoryNode[]> {
  const rows = await getDb()
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
    })
    .from(categories)
  return buildCategoryTree(rows)
}

/**
 * Menyemai kategori baku secara idempotent. Jalur tulis saja: migrasi 0009 sudah
 * menyemai saat pemasangan/upgrade, fungsi ini hanya memperbaiki instalasi yang
 * kehilangan baris tersebut. Jangan memanggilnya dari jalur baca.
 */
export async function ensureDefaultCategory(tx?: Tx): Promise<typeof categories.$inferSelect> {
  const run = async (scope: Tx) => {
    await lockCategoryStructure(scope)
    const [existing] = await scope
      .select()
      .from(categories)
      .where(
        sql`${categories.id} = ${DEFAULT_CATEGORY_ID} or ${categories.slug} = ${DEFAULT_CATEGORY_SLUG}`,
      )
      .limit(1)
    if (existing) return existing

    const [created] = await scope
      .insert(categories)
      .values({
        id: DEFAULT_CATEGORY_ID,
        name: DEFAULT_CATEGORY_NAME,
        slug: DEFAULT_CATEGORY_SLUG,
        description: 'Kategori bawaan untuk artikel.',
      })
      .onConflictDoNothing({ target: categories.slug })
      .returning()
    if (created) {
      await projectCategoryToCore(scope, created.id)
      return created
    }
    // Request lain menang lomba; baca hasilnya alih-alih gagal.
    const [raced] = await scope
      .select()
      .from(categories)
      .where(
        sql`${categories.id} = ${DEFAULT_CATEGORY_ID} or ${categories.slug} = ${DEFAULT_CATEGORY_SLUG}`,
      )
      .limit(1)
    if (!raced) throw new Error('Gagal membuat kategori bawaan.')
    return raced
  }
  return tx ? run(tx) : getDb().transaction(run)
}

export type DefaultCategoryState = {
  /** ID kategori baku yang dapat dipakai, atau null bila option dan fallback rusak. */
  id: string | null
  name: string | null
  slug: string | null
  /** Nilai option apa adanya, untuk form Pengaturan. */
  stored: string
  /** Terisi bila option tidak menunjuk kategori yang ada; wajib ditampilkan/diaudit. */
  notice?: string
}

/**
 * Menyelesaikan option `defaultCategory` menjadi identitas kategori nyata.
 * Menerima ID (kontrak baru) dan slug (nilai prototipe) agar upgrade tidak
 * memutus option; fallback ke kategori baku hanya saat option/term rusak dan
 * selalu menghasilkan notice.
 */
export async function resolveDefaultCategory(
  stored: string,
  tx?: Tx,
): Promise<DefaultCategoryState> {
  const db = tx || getDb()
  const wanted = stored.trim()
  const display = wanted.slice(0, 160) || '(belum dipilih)'
  if (wanted) {
    const [byId] = await db.select().from(categories).where(eq(categories.id, wanted)).limit(1)
    if (byId) return { id: byId.id, name: byId.name, slug: byId.slug, stored }
    const [bySlug] = await db.select().from(categories).where(eq(categories.slug, wanted)).limit(1)
    if (bySlug)
      return {
        id: bySlug.id,
        name: bySlug.name,
        slug: bySlug.slug,
        stored,
        notice: `Kategori baku masih tersimpan sebagai slug "${wanted}". Simpan ulang Pengaturan → Menulis agar tersimpan sebagai ID term.`,
      }
  }
  const [fallback] = await db
    .select()
    .from(categories)
    .where(
      sql`${categories.id} = ${DEFAULT_CATEGORY_ID} or ${categories.slug} = ${DEFAULT_CATEGORY_SLUG}`,
    )
    .limit(1)
  return {
    id: fallback?.id ?? null,
    name: fallback?.name ?? null,
    slug: fallback?.slug ?? null,
    stored,
    notice: fallback
      ? `Kategori baku "${display}" tidak ditemukan; artikel tanpa kategori memakai "${fallback.name}". Pilih ulang kategori di Pengaturan → Menulis.`
      : `Kategori baku "${display}" tidak ditemukan dan kategori cadangan belum tersedia; jalankan migrasi terbaru.`,
  }
}

/**
 * ID kategori baku untuk jalur tulis. Menjamin baris baku ada, karena pemanggil
 * memang sedang menulis di dalam transaksi yang sama.
 */
export async function defaultCategoryIdForWrite(stored: string, tx: Tx): Promise<string> {
  const resolved = await resolveDefaultCategory(stored, tx)
  if (resolved.id) return resolved.id
  return (await ensureDefaultCategory(tx)).id
}

/** Menolak induk yang hilang, lintas-tabel, atau membentuk siklus. */
async function assertParentAllowed(tx: Tx, id: string, parentId: string | null) {
  if (!parentId) return
  if (parentId === id) throw new Error('Kategori tidak dapat menjadi induknya sendiri.')
  const visited = new Set([id])
  let cursor: string | null = parentId
  while (cursor) {
    if (visited.has(cursor)) throw new Error('Induk kategori membentuk siklus.')
    if (visited.size > MAX_CATEGORY_DEPTH) throw new Error('Hierarki kategori terlalu dalam.')
    visited.add(cursor)
    const [row] = await tx
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, cursor))
      .limit(1)
    if (!row) throw new Error('Kategori induk tidak ditemukan.')
    cursor = row.parentId
  }
}

/** Slug unik di bawah lock. */
async function uniqueSlug(tx: Tx, base: string) {
  let candidate = base
  for (let i = 1; i <= 50; i++) {
    const [taken] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, candidate))
      .limit(1)
    if (!taken) return candidate
    const suffix = `-${i}`
    candidate = `${base.slice(0, 160 - suffix.length).replace(/-+$/, '')}${suffix}`
  }
  throw new Error('Tidak dapat membuat slug unik untuk kategori ini.')
}

export async function quickAddCategoryData(input: {
  name: string
  parentId?: string | null
}): Promise<{ id: string; name: string; slug: string; parentId: string | null }> {
  await requireTermWriter()
  input = z
    .object({ name: z.string(), parentId: z.string().max(32).nullable().optional() })
    .strict()
    .parse(input)
  const cleanName = input.name.trim()
  if (!cleanName || cleanName.length > 120)
    throw new Error('Nama kategori harus antara 1 dan 120 karakter.')
  const parentId = input.parentId?.trim() || null
  if (parentId && parentId.length > 32) throw new Error('Kategori induk tidak valid.')

  let baseSlug = slugify(cleanName).slice(0, 160).replace(/-+$/, '')
  if (!baseSlug) baseSlug = `kategori-${cleanName.length}-${newId().slice(0, 8)}`

  return getDb().transaction(async (tx) => {
    await lockCategoryStructure(tx)
    if (parentId) {
      const [parent] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, parentId))
        .limit(1)
      if (!parent) throw new Error('Kategori induk tidak ditemukan.')
    }

    // Nama yang sama di induk yang sama dianggap kategori yang sama, seperti
    // wp_insert_term yang menolak duplikat dalam satu namespace.
    const [existing] = await tx
      .select()
      .from(categories)
      .where(
        sql`lower(${categories.name}) = ${cleanName.toLowerCase()} and ${categories.parentId} is not distinct from ${parentId}`,
      )
      .limit(1)
    if (existing)
      return {
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        parentId: existing.parentId,
      }

    const id = newId()
    await assertParentAllowed(tx, id, parentId)
    const [created] = await tx
      .insert(categories)
      .values({
        id,
        name: cleanName,
        slug: await uniqueSlug(tx, baseSlug),
        description: '',
        parentId,
      })
      .returning()
    if (!created) throw new Error('Gagal menambahkan kategori.')
    await projectCategoryToCore(tx, created.id)
    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      parentId: created.parentId,
    }
  })
}

export async function saveTaxonomyData(kind: 'authors' | 'categories', data: FormData) {
  await requireTermWriter()
  if (kind === 'authors') throw new Error('Pengelolaan penulis telah dialihkan ke menu Pengguna.')
  const input = inputSchema.parse(Object.fromEntries(data))
  const id = input.id || newId()
  await getDb().transaction(async (tx) => {
    await lockContentStructure(tx)
    await lockCategoryStructure(tx)
    const [old] = await tx.select().from(categories).where(eq(categories.id, id)).limit(1)
    if (input.id && !old) throw new Error('Kategori tidak ditemukan.')
    await assertParentAllowed(tx, id, input.parentId)
    const [collision] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(sql`${categories.slug} = ${input.slug} and ${categories.id} <> ${id}`)
      .limit(1)
    if (collision) throw new Error('Slug kategori sudah dipakai.')
    const values = {
      name: input.name,
      slug: input.slug,
      description: input.description,
      parentId: input.parentId,
    }
    if (old) await rememberPostRoutes(tx, await getSettings())
    if (old) await tx.update(categories).set(values).where(eq(categories.id, id))
    else await tx.insert(categories).values({ id, ...values })
    await validatePublicPermalinks(tx, await getSettings())
    await projectCategoryToCore(tx, id)
  })
}

/**
 * Menghapus kategori setelah memindahkan artikel yang akan menjadi tanpa
 * kategori ke kategori baku, di dalam satu transaksi. Kategori baku yang aktif
 * tidak dapat dihapus, dan anak kategori naik satu tingkat.
 */
export async function deleteTaxonomyData(kind: 'authors' | 'categories', id: string) {
  await requireTermWriter()
  if (kind === 'authors') throw new Error('Pengelolaan penulis telah dialihkan ke menu Pengguna.')

  await getDb().transaction(async (tx) => {
    await lockContentStructure(tx)
    await lockCategoryStructure(tx)
    const [target] = await tx.select().from(categories).where(eq(categories.id, id)).limit(1)
    if (!target) return

    const defaultId = await defaultCategoryIdForWrite(await storedDefaultCategory(tx), tx)
    if (target.id === defaultId)
      throw new Error(
        `Kategori baku "${target.name}" tidak dapat dihapus. Tetapkan kategori baku lain di Pengaturan → Menulis terlebih dahulu.`,
      )

    const affected = await tx
      .select({ postId: postCategories.postId })
      .from(postCategories)
      .where(eq(postCategories.categoryId, id))
    await rememberPostRoutes(
      tx,
      await getSettings(),
      affected.map((row) => row.postId),
    )
    // Artikel yang hanya memakai kategori ini dipindahkan ke kategori baku
    // sebelum relasi dihapus, sehingga tidak ada artikel tanpa kategori.
    await tx.execute(
      sql`insert into post_categories (post_id, category_id)
          select pc.post_id, ${defaultId} from post_categories pc
          where pc.category_id = ${id}
            and not exists (
              select 1 from post_categories other
              where other.post_id = pc.post_id and other.category_id <> ${id}
            )
          on conflict do nothing`,
    )
    await tx.delete(postCategories).where(eq(postCategories.categoryId, id))
    // Anak kategori naik ke induk target agar tidak menjadi yatim.
    const children = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, id))
    await tx
      .update(categories)
      .set({ parentId: target.parentId })
      .where(eq(categories.parentId, id))
    for (const child of children) if (child.id !== id) await projectCategoryToCore(tx, child.id)
    await projectPostCategoriesToCore(
      tx,
      affected.map(({ postId }) => postId),
    )
    await removeCategoryProjection(tx, id)
    await tx.delete(categories).where(eq(categories.id, id))
    await validatePublicPermalinks(tx, await getSettings())
  })
}

/** Read through Options API in the same transaction as category writes. */
export async function storedDefaultCategory(tx?: Tx): Promise<string> {
  const options = createOptionsApi(
    createPostgresOptionStore(tx || getDb()),
    createCmsOptionRegistry(),
  )
  return settingsSchema.parse(await options.getOption('site')).defaultCategory
}
