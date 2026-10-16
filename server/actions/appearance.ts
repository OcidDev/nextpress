'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireCapability } from '@/lib/admin'
import type { AppearanceActionState } from '@/lib/content/appearance'
import { getActiveThemeId } from '@/lib/themes/manager'
import {
  AppearanceValidationError,
  applyAppearanceData,
  discardAppearanceData,
  restoreAppearanceData,
  saveAppearanceData,
} from '@/lib/db/queries/appearance'

const revisionSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((revision) => Number.isSafeInteger(revision), 'Versi rancangan tidak valid')
function errorState(error: unknown): AppearanceActionState {
  return {
    error:
      error instanceof AppearanceValidationError
        ? error.message
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 'Pengaturan tampilan tidak valid. Periksa bagian, widget, dan tautan.'
          : 'Tampilan belum dapat disimpan. Silakan coba lagi.',
  }
}

export async function saveAppearance(
  _: AppearanceActionState,
  data: FormData,
): Promise<AppearanceActionState> {
  await requireCapability('edit_theme_options')
  try {
    const draft = await saveAppearanceData(
      JSON.parse(String(data.get('config'))),
      revisionSchema.parse(data.get('revision')),
    )
    revalidatePath('/admin/site-editor')
    return { success: 'Rancangan tersimpan. Situs publik belum berubah.', revision: draft.revision }
  } catch (error) {
    return errorState(error)
  }
}

export async function applyAppearance(
  _: AppearanceActionState,
  data: FormData,
): Promise<AppearanceActionState> {
  await requireCapability('edit_theme_options')
  try {
    const active = await applyAppearanceData(revisionSchema.parse(data.get('revision')))
    revalidatePath('/', 'layout')
    return { success: 'Tampilan diterapkan ke situs.', revision: active.revision }
  } catch (error) {
    return errorState(error)
  }
}

export async function discardAppearance(
  _: AppearanceActionState,
  data: FormData,
): Promise<AppearanceActionState> {
  await requireCapability('edit_theme_options')
  try {
    await discardAppearanceData(revisionSchema.parse(data.get('revision')))
  } catch (error) {
    return errorState(error)
  }
  revalidatePath('/admin/site-editor')
  redirect(`/admin/site-editor?theme=${await getActiveThemeId()}`)
}

export async function restoreAppearance(
  _: AppearanceActionState,
  data: FormData,
): Promise<AppearanceActionState> {
  await requireCapability('edit_theme_options')
  try {
    await restoreAppearanceData(revisionSchema.parse(data.get('revision')))
  } catch (error) {
    return errorState(error)
  }
  revalidatePath('/', 'layout')
  redirect(`/admin/site-editor?theme=${await getActiveThemeId()}`)
}
