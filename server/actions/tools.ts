'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { importWxrData, importBloggerData, exportWxrData } from '@/lib/db/queries/tools'

export interface ImportActionResult {
  success?: boolean
  error?: string
  totalProcessed?: number
  importedCount?: number
  skippedCount?: number
  message?: string
}

export async function importWxrAction(
  _: unknown,
  formData: FormData,
): Promise<ImportActionResult> {
  await requireAdmin()

  const file = formData.get('file') as File | null
  const dryRun = formData.get('dryRun') === 'true'

  if (!file || file.size === 0) {
    return { error: 'Silakan pilih berkas XML ekspor WordPress terlebih dahulu.' }
  }

  if (file.size > 20 * 1024 * 1024) {
    return { error: 'Ukuran berkas melebihi batas maksimal 20 MB.' }
  }

  try {
    const xmlContent = await file.text()
    const result = await importWxrData(xmlContent, dryRun)

    revalidatePath('/admin/posts', 'layout')
    revalidatePath('/admin/pages', 'layout')

    return {
      success: true,
      totalProcessed: result.totalProcessed,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      message: dryRun
        ? `Simulasi berhasil: ditemukan ${result.totalProcessed} entri.`
        : `Impor berhasil: ${result.importedCount} entri ditambahkan, ${result.skippedCount} dilewati (duplikat).`,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Terjadi kegagalan saat mengimpor berkas WXR.',
    }
  }
}

export async function importBloggerAction(
  _: unknown,
  formData: FormData,
): Promise<ImportActionResult> {
  await requireAdmin()

  const file = formData.get('file') as File | null
  const dryRun = formData.get('dryRun') === 'true'

  if (!file || file.size === 0) {
    return { error: 'Silakan pilih berkas XML ekspor Blogger terlebih dahulu.' }
  }

  if (file.size > 25 * 1024 * 1024) {
    return { error: 'Ukuran berkas melebihi batas maksimal 25 MB.' }
  }

  try {
    const xmlContent = await file.text()
    const result = await importBloggerData(xmlContent, dryRun)

    revalidatePath('/admin/posts', 'layout')
    revalidatePath('/admin/pages', 'layout')
    revalidatePath('/admin/categories', 'layout')

    return {
      success: true,
      totalProcessed: result.totalProcessed,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      message: dryRun
        ? `Simulasi berhasil: ditemukan ${result.totalProcessed} entri (${result.postsCount} pos, ${result.pagesCount} laman).`
        : `Impor Blogger berhasil: ${result.importedCount} artikel/laman diimpor, ${result.skippedCount} dilewati.`,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Terjadi kegagalan saat mengimpor berkas Blogger.',
    }
  }
}

export async function exportWxrAction(filters: {
  type: 'all' | 'posts' | 'pages'
  status?: string
}): Promise<{ xml?: string; filename?: string; error?: string }> {
  try {
    const result = await exportWxrData(filters)
    return { xml: result.xml, filename: result.filename }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Gagal menghasilkan berkas ekspor WXR.',
    }
  }
}
