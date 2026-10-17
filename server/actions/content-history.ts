'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireCmsUser } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { contentRevisions } from '@/lib/db/schema'
import { adminPage, adminPost, savePageData, savePostData } from '@/lib/db/queries/admin-content'
import type { ActionState } from '@/lib/content/validation'

export async function restoreContentRevision(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCmsUser()
  const kind = z.enum(['posts', 'pages']).parse(data.get('kind'))
  const id = z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .parse(data.get('id'))
  const current = kind === 'posts' ? await adminPost(id) : await adminPage(id)
  if (!current || current.status === 'trash')
    return {
      error: 'Konten tidak ditemukan. Pulihkan dari Sampah terlebih dahulu jika diperlukan.',
    }
  try {
    const revisionId = z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .parse(data.get('revision'))
    const [revision] = await getDb()
      .select()
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.id, revisionId),
          eq(contentRevisions.kind, kind),
          eq(contentRevisions.contentId, id),
        ),
      )
    if (!revision) return { error: 'Revisi tidak ditemukan.' }
    const restored = new FormData()
    const fields =
      kind === 'posts'
        ? ['title', 'content', 'excerpt', 'featuredImage', 'featuredImageAlt', 'categories', 'tags']
        : ['title', 'content', 'parentId', 'pageTemplate', 'menuOrder']
    for (const key of fields) {
      const value = revision.snapshot[key]
      if (Array.isArray(value)) value.forEach((item) => restored.append(key, item))
      else if (typeof value === 'string') restored.set(key, value)
    }
    restored.set('id', id)
    restored.set('version', String(data.get('version') || ''))
    restored.set('slug', current.slug)
    restored.set('slugMode', 'manual')
    restored.set('status', current.status)
    // The normal save path rechecks privileges, version, media, references and publication.
    if (kind === 'posts') await savePostData(restored)
    else await savePageData(restored)
  } catch (error) {
    return {
      error:
        error instanceof Error && !('query' in error) && !('cause' in error)
          ? error.message
          : 'Revisi gagal dipulihkan. Periksa referensi konten dan muat ulang halaman.',
    }
  }
  revalidatePath('/', 'layout')
  redirect(`/admin/${kind}/${id}?saved=1`)
}
