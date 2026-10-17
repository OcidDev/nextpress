import 'server-only'
import { desc, eq, sql } from 'drizzle-orm'
import { requireCapability } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { updateJobs } from '@/lib/db/schema'
import { getRequestOptions } from '@/lib/core/options-server'
import { installedVersion } from './versions'
import { fetchLatestRelease, type UpdateCheck } from './release'
import { releaseCompatibility, type ReleaseManifest } from './manifest'
import type { DeploymentAdapter } from './adapter'
import { vercelAdapter } from './vercel'

/**
 * GitHub is polled at most every 15 minutes; the stored answer is served in
 * between, so refreshing the admin page never burns the API rate limit. A manual
 * check bypasses the window.
 */
export const checkTtlMs = 15 * 60 * 1000

/** A job older than this is reported, not silently trusted. The provider did not answer. */
const jobStaleMs = 60 * 60 * 1000

type CachedCheck = {
  checkedAt: string
  installed: string
  status: 'current' | 'available'
  version: string
  url: string
  latest: ReleaseManifest | null
}

export type UpdateJobView = {
  id: string
  fromVersion: string
  toVersion: string
  tag: string
  status: 'queued' | 'deploying' | 'ready' | 'failed'
  adapter: string
  externalUrl: string | null
  detail: string | null
  createdAt: string
  finishedAt: string | null
  stale: boolean
}

export type UpdatePageData = {
  installed: string
  check: UpdateCheck | null
  /** Cached answer when GitHub could not be reached, with the failure reason. */
  cached: CachedCheck | null
  error: string | null
  adapter: { id: string; label: string; ready: boolean; missing: string[] }
  job: UpdateJobView | null
}

const adapters: DeploymentAdapter[] = [vercelAdapter]

function adapter(): DeploymentAdapter {
  return adapters.find((item) => item.id === process.env.NEXTPRESS_DEPLOY_ADAPTER) ?? vercelAdapter
}

function cachedCheck(value: unknown): CachedCheck | null {
  const data = value as CachedCheck | undefined
  if (!data || typeof data.checkedAt !== 'string' || typeof data.version !== 'string') return null
  if (data.installed !== installedVersion) return null
  return data
}

async function storeCheck(check: UpdateCheck) {
  await getRequestOptions().updateOption('updates:check', {
    checkedAt: check.checkedAt,
    installed: check.installed,
    status: check.status,
    version: check.status === 'available' ? check.latest.version : check.installed,
    url: check.status === 'available' ? check.url : '',
    latest: check.status === 'available' ? check.latest : null,
  })
}

function fresh(check: CachedCheck, ttl: number) {
  return Date.now() - Date.parse(check.checkedAt) < ttl
}

/** Manual check always asks GitHub; the result is cached for the next read. */
export async function checkForUpdates(): Promise<{ check: UpdateCheck; cached: null; error: null }> {
  const check = await fetchLatestRelease(installedVersion)
  await storeCheck(check)
  return { check, cached: null, error: null }
}

/**
 * Serve a cached answer while it is fresh, otherwise ask GitHub. A failure never
 * throws: the page falls back to the last successful answer so a GitHub outage
 * cannot break the admin.
 */
export async function readUpdateStatus(): Promise<{
  check: UpdateCheck | null
  cached: CachedCheck | null
  error: string | null
}> {
  const options = getRequestOptions()
  const stored = cachedCheck(await options.getOption('updates:check'))
  if (stored && fresh(stored, checkTtlMs)) {
    if (stored.status === 'current')
      return {
        check: { status: 'current', checkedAt: stored.checkedAt, installed: stored.installed },
        cached: stored,
        error: null,
      }
    if (stored.latest)
      return {
        check: {
          status: 'available',
          checkedAt: stored.checkedAt,
          installed: stored.installed,
          latest: stored.latest,
          url: stored.url,
          ...releaseCompatibility(stored.latest),
        },
        cached: stored,
        error: null,
      }
    return { check: null, cached: stored, error: 'Manifest rilis tersimpan tidak lengkap.' }
  }
  try {
    const check = await fetchLatestRelease(installedVersion)
    await storeCheck(check)
    return { check, cached: null, error: null }
  } catch (error) {
    return {
      check: null,
      cached: stored,
      error: error instanceof Error ? error.message : 'Pemeriksaan pembaruan gagal.',
    }
  }
}

export async function jobView(): Promise<UpdateJobView | null> {
  const [row] = await getDb().select().from(updateJobs).orderBy(desc(updateJobs.createdAt)).limit(1)
  if (!row) return null
  return {
    id: row.id,
    fromVersion: row.fromVersion,
    toVersion: row.toVersion,
    tag: row.tag,
    status: row.status as UpdateJobView['status'],
    adapter: row.adapter,
    externalUrl: row.externalUrl,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    stale:
      (row.status === 'queued' || row.status === 'deploying') &&
      Date.now() - row.createdAt.getTime() > jobStaleMs,
  }
}

export async function getUpdatePageData(): Promise<UpdatePageData> {
  await requireCapability('update_core')
  const [status, job] = await Promise.all([readUpdateStatus(), jobView()])
  const active = adapter()
  const absent = active.missing()
  return {
    installed: installedVersion,
    check: status.check,
    cached: status.cached,
    error: status.error,
    adapter: { id: active.id, label: active.label, ready: absent.length === 0, missing: absent },
    job,
  }
}

function newJobId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 32)
}

export class UpdateJobError extends Error {}

/**
 * Start a deployment for a release the operator just saw on screen. The manifest
 * is re-fetched here rather than trusted from the form: the browser may submit
 * any tag, and only a stable release published by the official repository may
 * reach the deployment adapter.
 */
export async function startUpdateJob(tag: string): Promise<UpdateJobView> {
  const session = await requireCapability('update_core')
  const active = adapter()
  const absent = active.missing()
  if (absent.length)
    throw new UpdateJobError(`Pembaruan belum dikonfigurasi: ${absent.join(', ')} belum diisi.`)

  const check = await fetchLatestRelease(installedVersion)
  await storeCheck(check)
  if (check.status !== 'available')
    throw new UpdateJobError('Instalasi sudah memakai versi stabil terbaru.')
  if (check.latest.tag !== tag)
    throw new UpdateJobError('Rilis terbaru berubah sejak halaman dimuat. Muat ulang lalu periksa lagi.')
  if (!check.compatible)
    throw new UpdateJobError(check.incompatibleReason ?? 'Rilis tidak kompatibel dengan server ini.')

  const latest: ReleaseManifest = check.latest
  const created = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-update-job'))`)
    const [running] = await tx
      .select({ id: updateJobs.id })
      .from(updateJobs)
      .where(sql`${updateJobs.status} in ('queued', 'deploying')`)
      .limit(1)
    if (running) throw new UpdateJobError('Masih ada pembaruan berjalan. Tunggu hingga selesai.')
    const id = newJobId()
    await tx.insert(updateJobs).values({
      id,
      fromVersion: installedVersion,
      toVersion: latest.version,
      tag: latest.tag,
      commit: latest.commit,
      adapter: active.id,
      status: 'queued',
      migrations: latest.migrations,
      startedBy: session.user.id,
    })
    return id
  })

  try {
    const started = await active.start({
      version: latest.version,
      tag: latest.tag,
      commit: latest.commit,
    })
    await getDb()
      .update(updateJobs)
      .set({
        status: 'deploying',
        externalId: started.externalId,
        externalUrl: started.externalUrl,
        updatedAt: new Date(),
      })
      .where(eq(updateJobs.id, created))
  } catch (error) {
    await getDb()
      .update(updateJobs)
      .set({
        status: 'failed',
        detail: error instanceof Error ? error.message : 'Provider menolak deployment.',
        updatedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(updateJobs.id, created))
    throw error
  }
  return (await jobView())!
}

/**
 * Ask the provider what happened, and after it reports ready, confirm that the
 * site actually answers with the new version. "Deployment accepted" is not proof
 * the update is live; a stale build, a failed alias, or a rollback all look
 * identical from the provider's API.
 */
export async function refreshUpdateJob(): Promise<UpdateJobView | null> {
  await requireCapability('update_core')
  const [row] = await getDb()
    .select()
    .from(updateJobs)
    .where(sql`${updateJobs.status} in ('queued', 'deploying')`)
    .orderBy(desc(updateJobs.createdAt))
    .limit(1)
  if (!row) return jobView()
  if (!row.externalId) return jobView()

  const active = adapter()
  let state
  try {
    state = await active.status(row.externalId)
  } catch {
    // Transient provider or network failure: keep the job pending. The stale
    // marker tells the operator when polling has gone on too long.
    return jobView()
  }

  if (state.state === 'failed') {
    await finish(row.id, 'failed', state.detail)
    return jobView()
  }
  if (state.state === 'pending') {
    await getDb()
      .update(updateJobs)
      .set({ detail: state.detail ?? null, updatedAt: new Date() })
      .where(eq(updateJobs.id, row.id))
    return jobView()
  }

  const live = await liveVersion()
  if (live === row.toVersion) {
    await finish(row.id, 'ready', state.detail)
  } else {
    await getDb()
      .update(updateJobs)
      .set({
        detail: [state.detail, `Versi aktif: ${live ?? 'tidak terbaca'}`].filter(Boolean).join(' · '),
        updatedAt: new Date(),
      })
      .where(eq(updateJobs.id, row.id))
  }
  return jobView()
}

async function finish(id: string, status: 'ready' | 'failed', detail?: string) {
  await getDb()
    .update(updateJobs)
    .set({ status, detail: detail ?? null, updatedAt: new Date(), finishedAt: new Date() })
    .where(eq(updateJobs.id, id))
}

/** Version served by the public origin, read through the deployment's own route. */
async function liveVersion(): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!base) return null
  try {
    const response = await fetch(new URL('/api/version', base), {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as { version?: unknown }
    return typeof data.version === 'string' ? data.version : null
  } catch {
    return null
  }
}
