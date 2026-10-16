'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireCapability } from '@/lib/admin'
import {
  updatePersonalProfile,
  updatePersonalEmail,
  updatePersonalPassword,
} from '@/lib/db/queries/profile'
import type { ActionState } from '@/lib/content/validation'

export async function saveProfileIdentity(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('edit_profile')
  try {
    await updatePersonalProfile(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues.map((issue) => issue.message).join('. ') }
    }
    if (error instanceof Error && !('query' in error) && !('cause' in error)) {
      return { error: error.message }
    }
    return { error: 'Profil gagal disimpan. Periksa data atau koneksi database.' }
  }
  revalidatePath('/admin', 'layout')
  revalidatePath('/', 'layout')
  return { success: 'Profil berhasil diperbarui.' }
}

export async function saveProfileEmail(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('edit_profile')
  try {
    await updatePersonalEmail(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues.map((issue) => issue.message).join('. ') }
    }
    if (error instanceof Error && !('query' in error) && !('cause' in error)) {
      return { error: error.message }
    }
    return { error: 'Email gagal diperbarui. Periksa data atau koneksi database.' }
  }
  revalidatePath('/admin', 'layout')
  revalidatePath('/', 'layout')
  redirect('/admin/login?notice=email_updated')
}

export async function saveProfilePassword(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('edit_profile')
  try {
    await updatePersonalPassword(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues.map((issue) => issue.message).join('. ') }
    }
    if (error instanceof Error && !('query' in error) && !('cause' in error)) {
      return { error: error.message }
    }
    return { error: 'Kata sandi gagal diperbarui. Periksa data atau koneksi database.' }
  }
  revalidatePath('/admin', 'layout')
  revalidatePath('/', 'layout')
  redirect('/admin/login?notice=password_updated')
}
