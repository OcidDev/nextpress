'use server'

import { revalidatePath } from 'next/cache'
import { requireCmsUser } from '@/lib/admin'
import type { ActionState } from '@/lib/content/validation'
import { saveAdminPreferencesData } from '@/lib/db/queries/dashboard'

export async function saveAdminPreferences(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCmsUser()
  try {
    await saveAdminPreferencesData(JSON.parse(String(data.get('preferences'))))
  } catch {
    return { error: 'Preferensi tidak valid atau belum dapat disimpan. Silakan coba lagi.' }
  }
  revalidatePath('/admin', 'layout')
  return { success: 'Preferensi dashboard tersimpan.' }
}
