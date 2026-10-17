'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/admin'
import {
  checkForUpdates,
  refreshUpdateJob,
  startUpdateJob,
  UpdateJobError,
  type UpdateJobView,
} from '@/lib/updates/actions-data'

export interface UpdateActionResult {
  success?: boolean
  error?: string
  message?: string
  job?: UpdateJobView | null
}

function failure(error: unknown): UpdateActionResult {
  return {
    error:
      error instanceof UpdateJobError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Tindakan pembaruan gagal.',
  }
}

/** Ask GitHub now, ignoring the cache window. Every action re-checks server-side. */
export async function checkUpdatesAction(): Promise<UpdateActionResult> {
  await requireCapability('update_core')
  try {
    const { check } = await checkForUpdates()
    revalidatePath('/admin/updates')
    return {
      success: true,
      message:
        check.status === 'available'
          ? `Versi ${check.latest.version} tersedia.`
          : 'Instalasi sudah memakai versi stabil terbaru.',
    }
  } catch (error) {
    return failure(error)
  }
}

/**
 * Start the deployment for a tag the page displayed. The tag is the only value
 * accepted from the browser; the release manifest is re-fetched and re-validated
 * on the server, so a forged form can never point the adapter elsewhere.
 */
export async function startUpdateAction(tag: string): Promise<UpdateActionResult> {
  await requireCapability('update_core')
  try {
    const job = await startUpdateJob(tag)
    revalidatePath('/admin/updates')
    return { success: true, message: 'Deployment dimulai. Pantau status di bawah.', job }
  } catch (error) {
    return failure(error)
  }
}

/** Poll the provider and, once ready, verify the version the site actually serves. */
export async function refreshUpdateJobAction(): Promise<UpdateActionResult> {
  await requireCapability('update_core')
  try {
    const job = await refreshUpdateJob()
    if (job?.status === 'ready' || job?.status === 'failed') revalidatePath('/admin/updates')
    return { success: true, job }
  } catch (error) {
    return failure(error)
  }
}
