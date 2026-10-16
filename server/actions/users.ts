'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireCapability } from '@/lib/admin'
import { saveUserData, saveLegacyAuthorData } from '@/lib/db/queries/users'
import type { ActionState } from '@/lib/content/validation'

export async function saveUser(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('edit_users')
  let id: string
  try {
    id = await saveUserData(data)
  } catch (error) {
    if (error instanceof z.ZodError)
      return { error: error.issues.map((issue) => issue.message).join('. ') }
    if (error instanceof Error && !('query' in error) && !('cause' in error))
      return { error: error.message }
    return { error: 'Akun gagal disimpan. Periksa data atau koneksi database.' }
  }
  revalidatePath('/admin', 'layout')
  revalidatePath('/', 'layout')
  redirect(`/admin/users/${id}?saved=1`)
}

export async function saveLegacyAuthor(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('edit_users')
  try {
    await saveLegacyAuthorData(data)
  } catch (error) {
    if (error instanceof z.ZodError)
      return { error: error.issues.map((issue) => issue.message).join('. ') }
    if (error instanceof Error && !('query' in error) && !('cause' in error))
      return { error: error.message }
    return { error: 'Profil lama gagal disimpan. Periksa data atau koneksi database.' }
  }
  revalidatePath('/admin', 'layout')
  revalidatePath('/', 'layout')
  redirect('/admin/users?saved=1')
}
