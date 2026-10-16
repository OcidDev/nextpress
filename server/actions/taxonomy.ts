'use server'
import { requireCapability } from '@/lib/admin'
import {
  saveTaxonomyData,
  deleteTaxonomyData,
  quickAddCategoryData,
} from '@/lib/db/queries/taxonomy'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/content/validation'

export async function quickAddCategory(input: {
  name: string
  parentId?: string | null
}): Promise<{
  success: boolean
  category?: { id: string; name: string; slug: string; parentId: string | null }
  error?: string
}> {
  try {
    const category = await quickAddCategoryData(input)
    revalidatePath('/', 'layout')
    return { success: true, category }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tidak dapat menambahkan kategori.',
    }
  }
}

export async function saveTaxonomy(
  kind: 'authors' | 'categories',
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  await requireCapability('manage_categories')
  if (kind === 'authors') {
    return { error: 'Pengelolaan penulis telah dialihkan ke menu Pengguna.' }
  }
  try {
    await saveTaxonomyData(kind, data)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Tidak dapat menyimpan kategori.' }
  }
  revalidatePath('/', 'layout')
  redirect(`/admin/${kind}?saved=1`)
}
export async function deleteTaxonomy(
  kind: 'authors' | 'categories',
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  await requireCapability('manage_categories')
  if (kind === 'authors') {
    return { error: 'Pengelolaan penulis telah dialihkan ke menu Pengguna.' }
  }
  try {
    await deleteTaxonomyData(kind, String(data.get('id')))
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Tidak dapat menghapus kategori.' }
  }
  revalidatePath('/', 'layout')
  redirect(`/admin/${kind}`)
}
