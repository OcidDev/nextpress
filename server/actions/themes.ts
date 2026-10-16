'use server'

import { MAX_THEME_ZIP_BYTES, THEME_ZIP_SIZE_MESSAGE } from '@/lib/themes/limits'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/admin'
import { installThemeFromZip, setActiveThemeId } from '@/lib/themes/manager'

export interface ThemeActionResult {
  success?: boolean
  error?: string
  message?: string
}

export async function uploadThemeAction(
  _: unknown,
  formData: FormData,
): Promise<ThemeActionResult> {
  await requireCapability('install_themes')

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) {
    return { error: 'Silakan pilih berkas ZIP paket tema terlebih dahulu.' }
  }

  if (file.size > MAX_THEME_ZIP_BYTES) {
    return { error: THEME_ZIP_SIZE_MESSAGE }
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const result = await installThemeFromZip(buffer)

    revalidatePath('/admin/appearance', 'layout')
    revalidatePath('/', 'layout')
    return {
      success: true,
      message: `Tema "${result.name}" berhasil diunggah dan dipasang!`,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Terjadi kegagalan saat memasang paket tema.',
    }
  }
}

export async function activateThemeAction(themeId: string): Promise<ThemeActionResult> {
  await requireCapability('switch_themes')

  try {
    await setActiveThemeId(themeId)
    revalidatePath('/admin/appearance', 'layout')
    revalidatePath('/', 'layout')
    return {
      success: true,
      message: 'Tema berhasil diaktifkan.',
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Gagal mengaktifkan tema.',
    }
  }
}
