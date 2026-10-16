import { withOptionsTransaction } from '@/lib/core/options-server'
import { settingsSchema } from '@/lib/content/settings'
import { getSettings } from './settings'
import {
  rememberPostRoutes,
  validatePublicPermalinks,
  postPaths,
} from '@/lib/content/permalink-server'
import 'server-only'
import { validatePageParent } from '@/lib/content/page-tree'
import { isPageTemplate } from '@/lib/content/page-templates'
import sanitizeHtml from 'sanitize-html'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { requireCapability } from '@/lib/admin'
import { requireObjectPermission } from '@/lib/core/permissions-server'
import { userHasCapability, type Actor, type ObjectCapability } from '@/lib/core/roles'
import { getDb } from '@/lib/db'
import { posts, authors, categories, postCategories, postTags, pages, media } from '@/lib/db/schema'
import {
  postInput,
  pageInput,
  quickPostInput,
  bulkPostInput,
  slugSchema,
  reservedPageSlugs,
} from '@/lib/content/validation'
import { slugify } from '@/lib/utils'
import { newId } from '@/lib/db/ids'
import { ensureUserAuthor } from './user-authors'
import {
  defaultCategoryIdForWrite,
  storedDefaultCategory,
  resolveDefaultCategory,
  listCategoryTree,
} from './taxonomy'
import { postScope } from './cms-scope'
import { cleanHtml, wordCount } from '@/lib/content/sanitize'
import {
  projectPostToCore,
  projectPageToCore,
  deleteCoreProjection,
} from '@/lib/core/content-projection'
import { lockContentStructure } from '@/lib/core/content-mapping'
export { newId } from '@/lib/db/ids'

type ContentTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
async function requirePostPermission(
  tx: Pick<ContentTransaction, 'select'>,
  actor: Actor,
  post: typeof posts.$inferSelect,
  cap: ObjectCapability,
) {
  const [author] = await tx
    .select({ id: authors.userId })
    .from(authors)
    .where(eq(authors.id, post.authorId))
  await requireObjectPermission(actor, cap, {
    type: 'post',
    status: post.status,
    authorId: author?.id ?? null,
    publishedAt: post.publishedAt,
  })
}
function requirePublishPermission(actor: Parameters<typeof userHasCapability>[0], status: string) {
  if (status === 'published' && !userHasCapability(actor, 'publish_posts'))
    throw new Error('Anda tidak memiliki izin untuk menerbitkan artikel.')
}
async function validateMediaReferences(tx: ContentTransaction, html: string, cover = '') {
  const urls = [cover]
  sanitizeHtml(html, {
    allowedTags: ['img', 'a'],
    allowedAttributes: { img: ['src'], a: ['href'] },
    transformTags: {
      '*': (tagName, attribs) => {
        if (tagName === 'img' && attribs.src) urls.push(attribs.src)
        if (tagName === 'a' && attribs.href) urls.push(attribs.href)
        return { tagName, attribs }
      },
    },
  })
  const ids = [
    ...new Set(
      urls
        .map((url) => /^\/api\/media\/([a-f0-9]{32})(?:[?#].*)?$/.exec(url)?.[1])
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (!ids.length) return
  // Always acquire this before article/page row locks, matching appearance apply.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
  const available = await tx
    .select({ id: media.id })
    .from(media)
    .where(inArray(media.id, ids))
    .for('share')
  if (available.length !== ids.length)
    throw new Error('Ada gambar CMS yang sudah dihapus. Pilih gambar pengganti.')
}

export async function adminPost(id: string) {
  const session = await requireCapability('edit_posts')
  const db = getDb()
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), postScope(session.user)))
  if (!post) return null
  try {
    await requirePostPermission(db, session.user, post, 'edit_post')
  } catch {
    return null
  }
  const [labels, tags, [profile]] = await Promise.all([
    db.select().from(postCategories).where(eq(postCategories.postId, id)),
    db.select().from(postTags).where(eq(postTags.postId, id)),
    db
      .select({ name: authors.name, slug: authors.slug })
      .from(authors)
      .where(eq(authors.id, post.authorId)),
  ])
  return {
    ...post,
    authorName: profile?.name || 'Penulis',
    authorSlug: profile?.slug,
    permalink: (await postPaths([post.id])).get(post.id),
    categoryIds: labels.map((x) => x.categoryId),
    tags: tags.map((x) => x.tag),
  }
}
export async function editorOptions() {
  const session = await requireCapability('edit_posts')
  const [author, categoryTree, defaultCat] = await Promise.all([
    getDb().transaction((tx) => ensureUserAuthor(tx, session.user.id)),
    listCategoryTree(),
    storedDefaultCategory().then((stored) => resolveDefaultCategory(stored)),
  ])
  return {
    permalinkSettings: {
      structure: (await getSettings()).permalinkStructure,
      timezone: (await getSettings()).timezone,
    },
    author: { id: author.id, name: author.name, slug: author.slug },
    categories: categoryTree,
    defaultCategoryId: defaultCat.id,
    defaultCategoryName: defaultCat.name,
    categoryNotice: defaultCat.notice,
    canManageCategories: userHasCapability(session.user, 'manage_categories'),
    canPublish: userHasCapability(session.user, 'publish_posts'),
    canUpload: userHasCapability(session.user, 'upload_files'),
  }
}

async function contentSlug(
  tx: ContentTransaction,
  kind: 'posts' | 'pages',
  input: {
    title: string
    slug: string
    slugMode: 'auto' | 'manual'
  },
  id: string,
  oldSlug?: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'cms-slugs:' + kind}))`)
  const automatic = !oldSlug && (input.slugMode === 'auto' || !input.slug)
  const base = automatic
    ? slugify(input.title).slice(0, 160).replace(/-+$/, '') || `tulisan-${id.slice(0, 8)}`
    : input.slugMode === 'auto' && oldSlug
      ? oldSlug
      : input.slug
  slugSchema.parse(base)
  const table = kind === 'posts' ? posts : pages
  for (let index = 1; index <= 100; index++) {
    const suffix = index === 1 ? '' : `-${index}`
    const candidate = base.slice(0, 160 - suffix.length).replace(/-+$/, '') + suffix
    if (kind === 'pages' && reservedPageSlugs.has(candidate)) {
      if (automatic) continue
      throw new Error('Slug ini dipakai rute aplikasi')
    }
    const [taken] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.slug, candidate), ne(table.id, id)))
      .limit(1)
    if (!taken) return candidate
    if (!automatic)
      throw new Error(`Slug ${kind === 'posts' ? 'artikel' : 'halaman'} sudah digunakan`)
  }
  throw new Error('Slug belum tersedia. Coba slug manual yang lain.')
}
export async function quickEditPostData(data: FormData) {
  const session = await requireCapability('edit_posts')
  const input = quickPostInput.parse(Object.fromEntries(data))
  requirePublishPermission(session.user, input.status)
  await getDb().transaction(async (tx) => {
    await lockContentStructure(tx)
    const [old] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.id, input.id), postScope(session.user)))
      .for('update')
    if (!old) throw new Error('Artikel tidak ditemukan')
    await requirePostPermission(tx, session.user, old, 'edit_post')
    const version = old.updatedAt || old.publishedAt
    if (version.getTime() !== new Date(input.version).getTime())
      throw new Error('Artikel telah berubah. Muat ulang daftar sebelum mengedit kembali.')
    if (input.status === 'published' && wordCount(old.content) === 0)
      throw new Error('Isi artikel wajib diisi sebelum diterbitkan')
    await rememberPostRoutes(tx, await getSettings(), [old.id])
    const slug = await contentSlug(tx, 'posts', { ...input, slugMode: 'manual' }, old.id, old.slug)
    await tx
      .update(posts)
      .set({
        title: input.title,
        slug,
        status: input.status,
        updatedAt: new Date(Math.max(Date.now(), version.getTime() + 1)),
        publishedAt:
          input.status === 'published' && old.status !== 'published' ? new Date() : old.publishedAt,
      })
      .where(eq(posts.id, old.id))
    await validatePublicPermalinks(tx, await getSettings())
    await projectPostToCore(tx, old.id)
  })
}

export async function bulkPostStatusData(data: FormData) {
  const session = await requireCapability('edit_posts')
  const input = bulkPostInput.parse({ ids: data.getAll('ids'), status: data.get('status') })
  requirePublishPermission(session.user, input.status)
  const ids = [...new Set(input.ids)]
  await getDb().transaction(async (tx) => {
    await lockContentStructure(tx)
    const selected = await tx
      .select()
      .from(posts)
      .where(and(inArray(posts.id, ids), postScope(session.user)))
      .orderBy(posts.id)
      .for('update')
    if (selected.length !== ids.length)
      throw new Error(
        'Ada artikel yang tidak ditemukan atau tidak dapat Anda kelola. Tidak ada perubahan disimpan.',
      )
    for (const post of selected) await requirePostPermission(tx, session.user, post, 'edit_post')
    if (
      selected.some(
        (post) =>
          (post.updatedAt || post.publishedAt).getTime() !==
          new Date(String(data.get(`version:${post.id}`) || '')).getTime(),
      )
    )
      throw new Error(
        'Ada artikel yang telah berubah. Muat ulang daftar sebelum mencoba kembali. Tidak ada perubahan disimpan.',
      )
    if (input.status === 'published' && selected.some((post) => wordCount(post.content) === 0))
      throw new Error(
        'Ada artikel tanpa isi. Lengkapi isinya sebelum menerbitkan. Tidak ada perubahan disimpan.',
      )
    await rememberPostRoutes(tx, await getSettings(), ids)
    const now = new Date()
    for (const post of selected) {
      if (post.status === input.status) continue
      await tx
        .update(posts)
        .set({
          status: input.status,
          updatedAt: new Date(
            Math.max(now.getTime(), (post.updatedAt || post.publishedAt).getTime() + 1),
          ),
          publishedAt: input.status === 'published' ? now : post.publishedAt,
        })
        .where(eq(posts.id, post.id))
      await projectPostToCore(tx, post.id)
    }
  })
  return ids.length
}

export async function savePostData(data: FormData) {
  const session = await requireCapability('edit_posts')
  const input = postInput.parse({
    ...Object.fromEntries(data),
    ...(data.get('intent') === 'publish' ? { status: 'published' } : {}),
    categories: data.getAll('categories'),
  })
  requirePublishPermission(session.user, input.status)
  const id = input.id || newId()
  let oldSlug: string | undefined
  let savedSlug = input.slug
  let savedVersion = ''
  const content = cleanHtml(input.content)
  const words = wordCount(content)
  if (input.status === 'published' && words === 0)
    throw new Error('Isi artikel wajib diisi sebelum diterbitkan')
  await withOptionsTransaction(async (tx) => {
    await validateMediaReferences(tx, content, input.featuredImage)
    await lockContentStructure(tx)
    const [old] = input.id
      ? await tx
          .select()
          .from(posts)
          .where(and(eq(posts.id, id), postScope(session.user)))
          .for('update')
      : []
    if (input.id && !old) throw new Error('Artikel tidak ditemukan')
    if (old) await requirePostPermission(tx, session.user, old, 'edit_post')
    if (old && (old.updatedAt || old.publishedAt).getTime() !== new Date(input.version).getTime())
      throw new Error(
        'Artikel telah berubah. Salin perubahan Anda, lalu muat ulang editor sebelum menyimpan kembali.',
      )
    if (old) await rememberPostRoutes(tx, await getSettings(), [id])
    oldSlug = old?.slug
    const authorId = old?.authorId || (await ensureUserAuthor(tx, session.user.id)).id
    savedSlug = await contentSlug(tx, 'posts', input, id, old?.slug)
    const values = {
      title: input.title,
      slug: savedSlug,
      excerpt: input.excerpt,
      content,
      authorId,
      featuredImage: input.featuredImage || null,
      featuredImageAlt: input.featuredImageAlt || null,
      status: input.status,
      wordCount: words,
      readingTime: Math.max(1, Math.ceil(words / 200)),
      updatedAt: new Date(
        Math.max(Date.now(), old ? (old.updatedAt || old.publishedAt).getTime() + 1 : 0),
      ),
      publishedAt:
        old && (old.status === 'published' || input.status !== 'published')
          ? old.publishedAt
          : new Date(),
    }
    savedVersion = values.updatedAt.toISOString()
    if (old) await tx.update(posts).set(values).where(eq(posts.id, id))
    else await tx.insert(posts).values({ id, ...values })
    await tx.delete(postCategories).where(eq(postCategories.postId, id))
    await tx.delete(postTags).where(eq(postTags.postId, id))
    let categoryIds = [...new Set(input.categories)].filter(Boolean)
    if (categoryIds.length === 0) {
      categoryIds = [await defaultCategoryIdForWrite(await storedDefaultCategory(tx), tx)]
    }
    const availableCategories = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.id, categoryIds))
    if (availableCategories.length !== categoryIds.length)
      throw new Error('Kategori yang dipilih sudah dihapus. Muat ulang editor.')
    await tx
      .insert(postCategories)
      .values(categoryIds.map((categoryId) => ({ postId: id, categoryId })))
    const tags = [
      ...new Set(
        input.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ]
    if (tags.some((t) => t.length > 120) || tags.length > 30)
      throw new Error('Maksimal 30 tag, masing-masing 120 karakter')
    if (tags.length) await tx.insert(postTags).values(tags.map((tag) => ({ postId: id, tag })))
    await validatePublicPermalinks(tx, await getSettings())
    await projectPostToCore(tx, id)
  })
  return {
    id,
    slug: savedSlug,
    oldSlug,
    version: savedVersion,
    status: input.status,
  }
}
export async function deletePostData(id: string) {
  const session = await requireCapability('delete_posts')
  return getDb().transaction(async (tx) => {
    await lockContentStructure(tx)
    const [post] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), postScope(session.user)))
      .for('update')
    if (!post) throw new Error('Artikel tidak ditemukan')
    await requirePostPermission(tx, session.user, post, 'delete_post')
    await deleteCoreProjection(tx, id, 'post')
    await tx.delete(posts).where(eq(posts.id, id))
    return { slug: post.slug }
  })
}
export async function adminPage(id: string) {
  await requireCapability('edit_others_pages')
  return (await getDb().select().from(pages).where(eq(pages.id, id)))[0]
}
export async function savePageData(data: FormData) {
  await requireCapability('edit_pages')
  await requireCapability('edit_published_pages')
  await requireCapability('edit_others_pages')
  await requireCapability('publish_pages')
  const input = pageInput.parse(Object.fromEntries(data))
  const id = input.id || newId()
  const content = cleanHtml(input.content)
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-theme-activation'))`)
    await validateMediaReferences(tx, content)
    await lockContentStructure(tx)
    const [old] = input.id
      ? await tx.select().from(pages).where(eq(pages.id, id)).for('update')
      : []
    if (input.id && !old) throw new Error('Halaman tidak ditemukan')
    if (old && old.updatedAt.getTime() !== new Date(input.version).getTime())
      throw new Error(
        'Halaman telah berubah. Salin perubahan Anda, lalu muat ulang editor sebelum menyimpan kembali.',
      )
    const savedSlug = await contentSlug(tx, 'pages', input, id, old?.slug)
    const parentId = input.parentId === undefined ? (old?.parentId ?? null) : input.parentId || null
    const pageTemplate = input.pageTemplate ?? old?.pageTemplate ?? 'default'
    const pageRows = await tx
      .select({
        id: pages.id,
        title: pages.title,
        parentId: pages.parentId,
        menuOrder: pages.menuOrder,
      })
      .from(pages)
    validatePageParent(pageRows, id, parentId)
    if (pageTemplate !== 'default' && pageTemplate !== old?.pageTemplate && !isPageTemplate(pageTemplate))
      throw new Error('Templat laman tidak dikenal. Muat ulang editor dan pilih templat lain.')
    const values = {
      title: input.title,
      slug: savedSlug,
      parentId,
      menuOrder: input.menuOrder ?? old?.menuOrder ?? 0,
      pageTemplate,
      content,
      updatedAt: new Date(Math.max(Date.now(), old ? old.updatedAt.getTime() + 1 : 0)),
    }
    if (old) await tx.update(pages).set(values).where(eq(pages.id, id))
    else await tx.insert(pages).values({ id, ...values })
    await validatePublicPermalinks(tx, await getSettings())
    await projectPageToCore(tx, id)
    return {
      id,
      slug: savedSlug,
      oldSlug: old?.slug,
      version: values.updatedAt.toISOString(),
    }
  })
}
export async function deletePageData(id: string) {
  await requireCapability('delete_others_pages')
  await requireCapability('delete_published_pages')
  return withOptionsTransaction(async (tx, options) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
    await lockContentStructure(tx)
    const [page] = await tx.select().from(pages).where(eq(pages.id, id)).for('update')
    if (!page) throw new Error('Halaman tidak ditemukan')
    const settings = settingsSchema.parse(await options.getOption('site'))
    if (
      settings.showOnFront === 'page' &&
      [settings.pageOnFront, settings.pageForPosts].includes(id)
    )
      throw new Error('Pilih laman pengganti di Pengaturan → Membaca sebelum menghapus laman ini.')
    // WordPress reparents direct children when a page is permanently deleted.
    const children = await tx
      .update(pages)
      .set({ parentId: page.parentId, updatedAt: new Date() })
      .where(eq(pages.parentId, id))
      .returning({ id: pages.id })
    for (const child of children) await projectPageToCore(tx, child.id)
    await deleteCoreProjection(tx, id, 'page')
    const [deleted] = await tx.delete(pages).where(eq(pages.id, id)).returning({ slug: pages.slug })
    return deleted
  })
}
