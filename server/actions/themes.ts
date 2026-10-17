'use server'

import { MAX_THEME_ZIP_BYTES, THEME_ZIP_SIZE_MESSAGE } from '@/lib/themes/limits'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/admin'
import {
  ThemeDeletionError,
  deleteThemePackage,
  installThemeFromZip,
  setActiveThemeId,
} from '@/lib/themes/manager'

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

export async function deleteThemeAction(
  themeId: string,
  hash: string,
): Promise<ThemeActionResult> {
  await requireCapability('delete_themes')

  try {
    await deleteThemePackage(themeId, hash)
    revalidatePath('/admin/appearance', 'layout')
    return { success: true, message: 'Tema dihapus.' }
  } catch (error) {
    return {
      error:
        error instanceof ThemeDeletionError
          ? error.message
          : 'Gagal menghapus tema. Muat ulang halaman lalu coba lagi.',
    }
  }
}
