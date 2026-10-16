import 'server-only'
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { requireCapability } from '@/lib/admin'
import { postScope, mediaScope } from './cms-scope'
import { getDb } from '@/lib/db'
import { authors, comments, media, pages, posts, postTags } from '@/lib/db/schema'
import { z } from 'zod'
import { currentUserCan, userHasCapability } from '@/lib/core/roles'
import { getRequestRoles } from '@/lib/core/roles-server'
import { lockContentStructure } from '@/lib/core/content-mapping'
import { projectPostToCore } from '@/lib/core/content-projection'

export type ListSearch = Record<string, string | string[] | undefined>
export type ListParameters = {
  q: string
  page: number
  status: string
  view: 'grid' | 'list'
  tag: string
  month?: string
  role?: string
  sort?: string
  dir?: 'asc' | 'desc'
  /** Sortir tabel Profil lama pada halaman Pengguna; terpisah dari tabel akun. */
  lsort?: string
  ldir?: 'asc' | 'desc'
}
const pageSize = 20
function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || ''
}
export function customSortParameters<T extends string>(
  search: ListSearch,
  allowed: readonly T[],
  defaultSort: T,
  defaultDir: 'asc' | 'desc' = 'asc',
  sortKey = 'sort',
  dirKey = 'dir',
): { sort: T; dir: 'asc' | 'desc' } {
  const rawSort = single(search[sortKey]) as T
  const rawDir = single(search[dirKey]).toLowerCase()
  const sort = allowed.includes(rawSort) ? rawSort : defaultSort
  const dir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : defaultDir
  return { sort, dir }
}

export function sortParameters<T extends string>(
  search: ListSearch,
  allowed: readonly T[],
  defaultSort: T,
  defaultDir: 'asc' | 'desc' = 'asc',
): { sort: T; dir: 'asc' | 'desc' } {
  return customSortParameters(search, allowed, defaultSort, defaultDir, 'sort', 'dir')
}

export function listParameters(
  search: ListSearch,
  allowedStatuses: readonly string[] = [],
): ListParameters {
  const rawPage = Number(single(search.page) || '1')
  const status = single(search.status)
  return {
    q: single(search.q).trim().slice(0, 120),
    page: Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage : 1,
    status: allowedStatuses.includes(status) ? status : '',
    view: single(search.view) === 'list' ? 'list' : 'grid',
    tag: single(search.tag).trim().slice(0, 120),
  }
}
function searchPattern(q: string) {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`
}
function paging(total: number, requested: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return { total, pageCount, page: Math.min(requested, pageCount), pageSize }
}

export async function listedPosts(search: ListSearch) {
  const session = await requireCapability('edit_posts')
  const ownership = postScope(session.user)
  const params = listParameters(search, ['draft', 'pending', 'published'])
  const { sort, dir } = sortParameters(
    search,
    ['title', 'author', 'status', 'comments', 'updatedAt'] as const,
    'updatedAt',
    'desc',
  )
  params.sort = sort
  params.dir = dir

  const pattern = searchPattern(params.q)
  const where = and(
    ownership,
    params.q
      ? or(ilike(posts.title, pattern), ilike(posts.slug, pattern), ilike(posts.excerpt, pattern))
      : undefined,
    params.status ? eq(posts.status, params.status) : undefined,
    params.tag
      ? sql`exists (select 1 from ${postTags} where ${postTags.postId}=${posts.id} and ${postTags.tag}=${params.tag})`
      : undefined,
  )
  const db = getDb()
  const [total, groups] = await Promise.all([
    db.select({ value: count() }).from(posts).where(where),
    db
      .select({ status: posts.status, value: count() })
      .from(posts)
      .where(ownership)
      .groupBy(posts.status),
  ])
  const pagination = paging(total[0]!.value, params.page)

  const orderClauses = []
  if (sort === 'title') {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${posts.title})`) : asc(sql`lower(${posts.title})`),
    )
  } else if (sort === 'author') {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${authors.name})`) : asc(sql`lower(${authors.name})`),
    )
  } else if (sort === 'status') {
    orderClauses.push(dir === 'desc' ? desc(posts.status) : asc(posts.status))
  } else if (sort === 'comments') {
    orderClauses.push(dir === 'desc' ? desc(posts.commentCount) : asc(posts.commentCount))
  } else {
    orderClauses.push(dir === 'asc' ? asc(posts.updatedAt) : desc(posts.updatedAt))
  }
  orderClauses.push(desc(posts.id))

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      status: posts.status,
      updatedAt: posts.updatedAt,
      publishedAt: posts.publishedAt,
      commentCount: posts.commentCount,
      authorName: authors.name,
      authorId: authors.userId,
    })
    .from(posts)
    .innerJoin(authors, eq(authors.id, posts.authorId))
    .where(where)
    .orderBy(...orderClauses)
    .limit(pageSize)
    .offset((pagination.page - 1) * pageSize)
  const roles = await getRequestRoles()
  return {
    rows: rows.map(({ authorId, ...row }) => ({
      ...row,
      canEdit: currentUserCan(session.user, 'edit_post', { ...row, type: 'post', authorId }, roles),
      canDelete: currentUserCan(
        session.user,
        'delete_post',
        { ...row, type: 'post', authorId },
        roles,
      ),
    })),
    canPublish: userHasCapability(session.user, 'publish_posts'),
    params,
    ...pagination,
    statusCounts: Object.fromEntries(groups.map((row) => [row.status, row.value])),
  }
}

export async function listedPages(search: ListSearch) {
  await requireCapability('edit_others_pages')
  const params = listParameters(search)
  const { sort, dir } = sortParameters(
    search,
    ['title', 'updatedAt', 'menuOrder'] as const,
    'menuOrder',
    'asc',
  )
  params.sort = sort
  params.dir = dir

  const pattern = searchPattern(params.q)
  const where = params.q ? or(ilike(pages.title, pattern), ilike(pages.slug, pattern)) : undefined
  const db = getDb()
  const [total] = await db.select({ value: count() }).from(pages).where(where)
  const pagination = paging(total!.value, params.page)

  const orderClauses = []
  if (sort === 'title') {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${pages.title})`) : asc(sql`lower(${pages.title})`),
    )
  } else if (sort === 'menuOrder') {
    orderClauses.push(
      dir === 'desc' ? desc(pages.menuOrder) : asc(pages.menuOrder),
      asc(sql`lower(${pages.title})`),
    )
  } else {
    orderClauses.push(dir === 'asc' ? asc(pages.updatedAt) : desc(pages.updatedAt))
  }
  orderClauses.push(desc(pages.id))

  const parent = alias(pages, 'page_parent')
  const rows = await db
    .select({
      id: pages.id,
      title: pages.title,
      slug: pages.slug,
      updatedAt: pages.updatedAt,
      menuOrder: pages.menuOrder,
      parentTitle: parent.title,
    })
    .from(pages)
    .leftJoin(parent, eq(parent.id, pages.parentId))
    .where(where)
    .orderBy(...orderClauses)
    .limit(pageSize)
    .offset((pagination.page - 1) * pageSize)
  return { rows, params, ...pagination }
}

export async function listedComments(search: ListSearch) {
  await requireCapability('moderate_comments')
  const params = listParameters(search, ['pending', 'approved', 'spam'])
  const pattern = searchPattern(params.q)
  const where = and(
    params.q
      ? or(
          ilike(comments.authorName, pattern),
          ilike(comments.authorEmail, pattern),
          ilike(comments.content, pattern),
          ilike(posts.title, pattern),
        )
      : undefined,
    params.status ? eq(comments.status, params.status) : undefined,
  )
  const db = getDb()
  const [total] = await db
    .select({ value: count() })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(where)
  const pagination = paging(total!.value, params.page)
  const rows = await db
    .select({
      id: comments.id,
      postId: comments.postId,
      title: posts.title,
      authorName: comments.authorName,
      authorEmail: comments.authorEmail,
      content: comments.content,
      status: comments.status,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(where)
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(pageSize)
    .offset((pagination.page - 1) * pageSize)
  return { rows, params, ...pagination }
}

const mediaMetadata = {
  id: media.id,
  name: media.name,
  alt: media.alt,
  title: media.title,
  caption: media.caption,
  description: media.description,
  mimeType: media.mimeType,
  size: media.size,
  width: media.width,
  height: media.height,
  createdAt: media.createdAt,
}
export async function listedMedia(search: ListSearch) {
  const session = await requireCapability('upload_files')
  const params = listParameters(search)
  const { sort, dir } = sortParameters(
    search,
    ['name', 'alt', 'size', 'createdAt'] as const,
    'createdAt',
    'desc',
  )
  params.sort = sort
  params.dir = dir

  const month = single(search.month)
  params.month = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : ''
  const pattern = searchPattern(params.q)
  const where = and(
    params.month
      ? sql`to_char(${media.createdAt} at time zone 'Asia/Jakarta', 'YYYY-MM') = ${params.month}`
      : undefined,
    mediaScope(session.user),
    params.q
      ? or(
          ilike(media.name, pattern),
          ilike(media.title, pattern),
          ilike(media.alt, pattern),
          ilike(media.caption, pattern),
        )
      : undefined,
  )
  const db = getDb()
  const [total] = await db.select({ value: count() }).from(media).where(where)
  const pagination = paging(total!.value, params.page)

  const orderClauses = []
  if (sort === 'name') {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${media.name})`) : asc(sql`lower(${media.name})`),
    )
  } else if (sort === 'alt') {
    orderClauses.push(
      dir === 'desc'
        ? desc(sql`lower(coalesce(${media.alt}, ''))`)
        : asc(sql`lower(coalesce(${media.alt}, ''))`),
    )
  } else if (sort === 'size') {
    orderClauses.push(dir === 'desc' ? desc(media.size) : asc(media.size))
  } else {
    orderClauses.push(dir === 'asc' ? asc(media.createdAt) : desc(media.createdAt))
  }
  orderClauses.push(desc(media.id))

  const rows = await db
    .select(mediaMetadata)
    .from(media)
    .where(where)
    .orderBy(...orderClauses)
    .limit(pageSize)
    .offset((pagination.page - 1) * pageSize)
  const months = await db
    .selectDistinct({
      month: sql<string>`to_char(${media.createdAt} at time zone 'Asia/Jakarta', 'YYYY-MM')`,
    })
    .from(media)
    .where(mediaScope(session.user))
    .orderBy(desc(sql`to_char(${media.createdAt} at time zone 'Asia/Jakarta', 'YYYY-MM')`))
  return { rows, params, months: months.map((row) => row.month), ...pagination }
}
export async function mediaDetails(id: string) {
  const session = await requireCapability('upload_files')
  if (!/^[a-f0-9]{32}$/.test(id)) return null
  return (
    (
      await getDb()
        .select(mediaMetadata)
        .from(media)
        .where(and(eq(media.id, id), mediaScope(session.user)))
    )[0] || null
  )
}

export async function listedTags(search: ListSearch) {
  await requireCapability('manage_categories')
  const params = listParameters(search)
  const { sort, dir } = sortParameters(search, ['name', 'count'] as const, 'name', 'asc')
  params.sort = sort
  params.dir = dir

  const where = params.q ? ilike(postTags.tag, searchPattern(params.q)) : undefined
  const db = getDb()
  const [total] = await db
    .select({ value: sql<number>`count(distinct ${postTags.tag})::int` })
    .from(postTags)
    .where(where)
  const pagination = paging(total!.value, params.page)

  const orderClauses = []
  if (sort === 'count') {
    orderClauses.push(dir === 'desc' ? desc(count()) : asc(count()))
  } else {
    orderClauses.push(
      dir === 'desc' ? desc(sql`lower(${postTags.tag})`) : asc(sql`lower(${postTags.tag})`),
    )
  }
  orderClauses.push(asc(postTags.tag))

  const rows = await db
    .select({ name: postTags.tag, count: count() })
    .from(postTags)
    .where(where)
    .groupBy(postTags.tag)
    .orderBy(...orderClauses)
    .limit(pageSize)
    .offset((pagination.page - 1) * pageSize)
  return { rows, params, ...pagination }
}

const tagName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !value.includes(','), 'Tag tidak boleh berisi koma')
export async function changeTag(from: string, to?: string) {
  await requireCapability('manage_categories')
  const current = tagName.parse(from)
  const replacement = to === undefined ? undefined : tagName.parse(to)
  if (current === replacement) return
  await getDb().transaction(async (tx) => {
    await lockContentStructure(tx)
    // The article editor locks the same rows when saving its tag assignments.
    const selected = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(
        sql`exists (select 1 from ${postTags} where ${postTags.postId}=${posts.id} and ${postTags.tag}=${current})`,
      )
      .orderBy(posts.id)
      .for('update')
    const ids = selected.map((post) => post.id)
    if (!ids.length) return
    // Only mutate assignments belonging to the rows we locked. A concurrent
    // editor may add this tag to another article after the selection snapshot.
    if (replacement)
      await tx.execute(sql`
      insert into ${postTags} ("post_id", "tag")
      select ${postTags.postId}, ${replacement} from ${postTags} where ${postTags.tag}=${current}
      and ${inArray(postTags.postId, ids)}
      on conflict do nothing
    `)
    await tx.delete(postTags).where(and(eq(postTags.tag, current), inArray(postTags.postId, ids)))
    // Tag changes are editorial changes too: previously opened full/quick/bulk
    // editors must not silently restore a renamed or deleted tag assignment.
    await tx
      .update(posts)
      .set({
        updatedAt: sql`greatest(clock_timestamp(), coalesce(${posts.updatedAt}, ${posts.publishedAt}) + interval '1 millisecond')`,
      })
      .where(inArray(posts.id, ids))
    for (const id of ids) await projectPostToCore(tx, id)
  })
}
