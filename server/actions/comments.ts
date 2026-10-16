'use server'
import { z } from 'zod'
import { requireCapability } from '@/lib/admin'
import { submitCommentData, moderateCommentData } from '@/lib/db/queries/comments'
import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/content/validation'
export async function submitComment(_: ActionState, data: FormData): Promise<ActionState> {
  try {
    await submitCommentData(data)
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? 'Periksa nama, email, dan isi komentar.'
          : error instanceof Error && !('cause' in error)
            ? error.message
            : 'Komentar belum dapat dikirim.',
    }
  }
  return { success: 'Komentar dikirim dan menunggu persetujuan moderator.' }
}
export async function moderateComment(_: ActionState, data: FormData): Promise<ActionState> {
  await requireCapability('moderate_comments')
  const status = z.enum(['approved', 'pending', 'spam']).safeParse(data.get('status'))
  if (!status.success) return { error: 'Status tidak valid' }
  const id = String(data.get('id'))
  const moderated = await moderateCommentData(id, status.data)
  revalidatePath('/', 'layout')
  // `moderated` tetap dipakai untuk memastikan komentar masih ada.
  void moderated
  return { success: 'Status komentar diperbarui.' }
}
