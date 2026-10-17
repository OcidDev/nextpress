'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCapability, requireCmsUser } from '@/lib/admin'
import {
  savePostData,
  deletePostData,
  savePageData,
  deletePageData,
  quickEditPostData,
  bulkPostStatusData,
  restoreTrashedContentData,
} from '@/lib/db/queries/admin-content'
import type { ActionState } from '@/lib/content/validation'
import { doAction } from '@/lib/extensions/hooks'
import { bootExtensions } from '@/lib/extensions/bootstrap'
function message(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { error: error.issues.map((x) => x.message).join('. ') }
  if (error instanceof Error && !('query' in error) && !('cause' in error))
    return { error: error.message }
  return { error: 'Perubahan gagal disimpan. Periksa data atau koneksi database.' }
}
function refresh() {
  revalidatePath('/', 'layout')
  revalidatePath('/admin', 'layout')
}
export async function savePost(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCmsUser()
  let result
  try {
    result = await savePostData(data)
  } catch (error) {
    return message(error)
  }
  refresh()
  // Server action dapat berjalan tanpa render layout mana pun, jadi kernel
  // dimuat di sini sebelum action dipicu.
  await bootExtensions()
  // Action ekstensi dijalankan setelah perubahan tersimpan dan cache dibuang.
  // Halaman artikel (`pages`) sengaja belum memicu action apa pun; hook `page_*`
  // belum ada di peta tipe.
  await doAction('post_saved', {
    id: result.id,
    slug: result.slug,
    status:
      result.status === 'published'
        ? 'published'
        : result.status === 'pending'
          ? 'pending'
          : 'draft',
  })
  if (result.status === 'published')
    await doAction('post_published', { id: result.id, slug: result.slug })
  return { success: 'Artikel tersimpan.', saved: result }
}
export async function quickEditPost(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCmsUser()
  try {
    await quickEditPostData(data)
  } catch (error) {
    return message(error)
  }
  refresh()
  return { success: 'Artikel tersimpan.' }
}
export async function bulkPostStatus(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCmsUser()
  let total
  try {
    total = await bulkPostStatusData(data)
  } catch (error) {
    return message(error)
  }
  refresh()
  return { success: `Status ${total} artikel telah diproses.` }
}
export async function deletePost(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCmsUser()
  try {
    await deletePostData(String(data.get('id')))
  } catch (error) {
    return message(error)
  }
  refresh()
  redirect('/admin/posts')
}
export async function savePage(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('edit_pages')
  let result
  try {
    result = await savePageData(data)
  } catch (error) {
    return message(error)
  }
  refresh()
  return { success: 'Halaman tersimpan.', saved: result }
}
export async function deletePage(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('edit_pages')
  try {
    await deletePageData(String(data.get('id')))
  } catch (error) {
    return message(error)
  }
  refresh()
  redirect('/admin/pages')
}

export async function manageTrashedContent(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCmsUser()
  try {
    const kind = z.enum(['posts', 'pages']).parse(data.get('kind'))
    const id = z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .parse(data.get('id'))
    const operation = z.enum(['restore', 'delete']).parse(data.get('operation'))
    if (operation === 'restore') await restoreTrashedContentData(kind, id)
    else if (kind === 'posts') await deletePostData(id, true)
    else await deletePageData(id, true)
    refresh()
    return {
      success:
        operation === 'restore' ? 'Konten dipulihkan sebagai draft.' : 'Konten dihapus permanen.',
    }
  } catch (error) {
    return message(error)
  }
}
