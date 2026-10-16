'use server'
import { SettingsValidationError } from '@/lib/content/settings'
import { requireAdmin, requireCapability } from '@/lib/admin'
import {
  saveSettingsData,
  saveSettingsSectionData,
  settingsSections,
} from '@/lib/db/queries/settings'
import { uploadMediaData, deleteMediaData, updateMediaData } from '@/lib/db/queries/media'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/content/validation'
import { mediaDetails } from '@/lib/db/queries/admin-list'
import type { EditorMedia } from '@/components/admin/MediaPicker'
import { MEDIA_UPLOAD_MAX_MB } from '@/lib/media-limits'

export async function uploadEditorMedia(
  data: FormData,
): Promise<{ media?: EditorMedia; error?: string }> {
  await requireCapability('upload_files')
  try {
    const id = await uploadMediaData(data)
    const item = await mediaDetails(id)
    if (!item) throw new Error('Media belum tersedia')
    revalidatePath('/admin/media')
    return {
      media: {
        id: item.id,
        name: item.name,
        alt: item.alt,
        title: item.title,
        caption: item.caption,
        description: item.description,
        size: item.size,
        width: item.width,
        height: item.height,
      },
    }
  } catch {
    return {
      error: `Gagal mengunggah. Gunakan gambar JPEG, PNG, WebP, GIF, atau AVIF maksimal ${MEDIA_UPLOAD_MAX_MB} MB dan 25 megapiksel.`,
    }
  }
}
export async function saveSettings(_: ActionState, data: FormData): Promise<ActionState> {
  await requireAdmin()
  try {
    const section = String(data.get('section') || '')
    const value = JSON.parse(String(data.get('settings')))
    if (section) {
      if (!Object.hasOwn(settingsSections, section)) throw new Error('Bagian tidak valid')
      await saveSettingsSectionData(section as keyof typeof settingsSections, value)
    } else await saveSettingsData(value)
  } catch (error) {
    return {
      error:
        error instanceof SettingsValidationError
          ? error.message
          : 'Pengaturan tidak valid. Periksa nama, tautan, tema, dan ID integrasi.',
    }
  }
  revalidatePath('/', 'layout')
  return { success: 'Pengaturan tersimpan.' }
}
export async function updateMedia(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('upload_files')
  try {
    await updateMediaData(
      String(data.get('id')),
      String(data.get('alt') || ''),
      Object.fromEntries(
        ['title', 'caption', 'description']
          .filter((key) => data.has(key))
          .map((key) => [key, String(data.get(key) || '')]),
      ),
    )
  } catch {
    return { error: 'Gagal menyimpan detail media. Periksa panjang isian dan hak akses.' }
  }
  revalidatePath('/admin/media')
  return { success: 'Detail media tersimpan.' }
}

export async function removeSelectedMedia(
  ids: string[],
): Promise<{ deleted: string[]; failed: string[] }> {
  await requireCapability('upload_files')
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id))
  )
    throw new Error('Pilihan media tidak valid')
  const deleted: string[] = [],
    failed: string[] = []
  for (const id of new Set(ids)) {
    try {
      await deleteMediaData(id)
      deleted.push(id)
    } catch {
      failed.push(id)
    }
  }
  revalidatePath('/admin/media')
  return { deleted, failed }
}
