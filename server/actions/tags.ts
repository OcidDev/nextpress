'use server'

import { requireCapability } from '@/lib/admin'
import { changeTag } from '@/lib/db/queries/admin-list'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/content/validation'

export async function renameTag(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('manage_categories')
  try {
    await changeTag(String(data.get('id') || ''), String(data.get('name') || ''))
  } catch {
    return { error: 'Nama tag wajib diisi, maksimal 120 karakter, dan tidak boleh berisi koma.' }
  }
  revalidatePath('/', 'layout')
  revalidatePath('/admin', 'layout')
  redirect('/admin/tags?saved=1')
}

export async function deleteTag(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('manage_categories')
  try {
    await changeTag(String(data.get('id') || ''))
  } catch {
    return { error: 'Tag tidak dapat dihapus. Periksa data atau koneksi database.' }
  }
  revalidatePath('/', 'layout')
  revalidatePath('/admin', 'layout')
  redirect('/admin/tags')
}
