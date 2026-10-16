'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCapability } from '@/lib/admin'
import type { ActionState } from '@/lib/content/validation'
import { clearExtensionHealth, readExtensionHealth } from '@/lib/extensions/health-query'

/**
 * Mode pemulihan (sprint EXT-02): menghapus catatan kegagalan satu ekstensi
 * sehingga kernel memuatnya lagi pada permintaan berikutnya.
 *
 * Dijaga kapabilitas `activate_plugins`, bukan peran langsung — sama seperti
 * menyalakan plugin. Perubahan ini tidak langsung memuat ekstensi: request
 * berikutnya yang mem-boot kernel yang melakukannya, dan bila ekstensi itu masih
 * gagal ia akan dijeda lagi setelah `failureThreshold` kegagalan.
 */
export async function resumeExtension(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('activate_plugins')
  const id = z.string().trim().min(1).max(64).safeParse(data.get('id'))
  if (!id.success) return { error: 'Id ekstensi tidak valid.' }
  // Hanya catatan yang benar-benar dijeda yang boleh dihapus, supaya action ini
  // tidak dapat dipakai untuk menulis baris sembarang ke penyimpanan kesehatan.
  const health = await readExtensionHealth()
  if (!health[id.data]?.paused) return { error: 'Ekstensi itu tidak sedang dijeda.' }
  await clearExtensionHealth(id.data)
  revalidatePath('/admin', 'layout')
  return { success: `Ekstensi ${id.data} akan dicoba lagi pada permintaan berikutnya.` }
}
