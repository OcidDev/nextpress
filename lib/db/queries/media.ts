import 'server-only'
import { and, eq, or, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { z } from 'zod'
import { requireCapability } from '@/lib/admin'
import { mediaScope } from './cms-scope'
import { getDb } from '@/lib/db'
import { media, posts, pages, options, user, authors, contentRevisions } from '@/lib/db/schema'
import { content } from '@/lib/db/core-schema'
import { newId } from './admin-content'
import { MEDIA_UPLOAD_MAX_BYTES, MEDIA_UPLOAD_MAX_MB } from '@/lib/media-limits'
import { projectMediaToCore, deleteCoreProjection } from '@/lib/core/content-projection'
import { lockContentStructure } from '@/lib/core/content-mapping'
export async function uploadMediaData(data: FormData) {
  const admin = await requireCapability('upload_files')
  const file = data.get('file')
  const alt = String(data.get('alt') || '').trim()
  if (!(file instanceof File) || file.size === 0 || file.size > MEDIA_UPLOAD_MAX_BYTES)
    throw new Error(`Pilih gambar maksimal ${MEDIA_UPLOAD_MAX_MB} MB`)
  if (alt.length > 250) throw new Error('Alt text maksimal 250 karakter')
  const buffer = Buffer.from(await file.arrayBuffer())
  const image = sharp(buffer, { limitInputPixels: 25_000_000, animated: false })
  const info = await image.metadata()
  if (!['jpeg', 'png', 'webp', 'gif', 'avif'].includes(info.format || ''))
    throw new Error('Format gambar tidak didukung')
  const { data: output, info: result } = await image
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
  const id = newId()
  await getDb().transaction(async (tx) => {
    await lockContentStructure(tx)
    await tx.insert(media).values({
      id,
      name: file.name.slice(0, 250),
      title: file.name.replace(/\.[^.]+$/, '').slice(0, 250),
      mimeType: 'image/webp',
      size: output.length,
      width: result.width,
      height: result.height,
      alt,
      data: output,
      uploadedBy: admin.user.id,
    })
    await projectMediaToCore(tx, id)
  })
  return id
}
export async function updateMediaData(
  id: string,
  alt: string,
  metadata: { title?: string; caption?: string; description?: string } = {},
) {
  const session = await requireCapability('upload_files')
  const values = z
    .object({
      alt: z.string().max(250),
      title: z.string().max(250).optional(),
      caption: z.string().max(2000).optional(),
      description: z.string().max(10000).optional(),
    })
    .parse({ alt, ...metadata })
  await getDb().transaction(async (tx) => {
    await lockContentStructure(tx)
    const [updated] = await tx
      .update(media)
      .set(values)
      .where(and(eq(media.id, id), mediaScope(session.user)))
      .returning({ id: media.id })
    if (!updated) throw new Error('Media tidak ditemukan')
    await projectMediaToCore(tx, id)
  })
}
export async function deleteMediaData(id: string) {
  const session = await requireCapability('upload_files')
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Media tidak valid')
  const path = `/api/media/${id}`
  await getDb().transaction(async (tx) => {
    // Share the configuration lock with draft/apply/settings and content image writes.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
    await lockContentStructure(tx)
    const [existing] = await tx
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, id), mediaScope(session.user)))
      .for('update')
    if (!existing) throw new Error('Media tidak ditemukan')
    // A transaction shares one PostgreSQL connection; run its queries in order.
    const usedPosts = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(
        or(
          eq(posts.featuredImage, path),
          sql`strpos(${posts.content}, ${path}) > 0`,
          sql`strpos(${posts.seo}::text, ${path}) > 0`,
        ),
      )
      .limit(1)
    const usedPages = await tx
      .select({ id: pages.id })
      .from(pages)
      .where(
        or(
          sql`strpos(${pages.content}, ${path}) > 0`,
          sql`strpos(${pages.seo}::text, ${path}) > 0`,
        ),
      )
      .limit(1)
    const usedRevisions = await tx
      .select({ id: contentRevisions.id })
      .from(contentRevisions)
      .where(sql`strpos(${contentRevisions.snapshot}::text, ${path}) > 0`)
      .limit(1)
    const usedSettings = await tx
      .select({ id: options.name })
      .from(options)
      .where(sql`strpos(${options.value}::text, ${path}) > 0`)
      .limit(1)
    const usedUsers = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.image, path))
      .limit(1)
    const usedAuthors = await tx
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.avatar, path))
      .limit(1)
    const usedContent = await tx
      .select({ id: content.id })
      .from(content)
      .where(sql`strpos(${content.content}, ${path}) > 0`)
      .limit(1)
    if (
      usedRevisions.length ||
      usedPosts.length ||
      usedPages.length ||
      usedSettings.length ||
      usedUsers.length ||
      usedAuthors.length ||
      usedContent.length
    )
      throw new Error('Media masih digunakan oleh konten atau pengaturan situs')
    await deleteCoreProjection(tx, id, 'media')
    await tx.delete(media).where(eq(media.id, id))
  })
}
export async function publicMedia(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) return null
  return (await getDb().select().from(media).where(eq(media.id, id)))[0] ?? null
}
