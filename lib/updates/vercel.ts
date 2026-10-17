import 'server-only'
import type { DeploymentAdapter, DeploymentState, DeploymentTarget } from './adapter'
import { UpdateAdapterError } from './adapter'

const api = 'https://api.vercel.com'
// Deployments take minutes. Requests stay short so an admin page never hangs on
// the provider; progress lives on the job row and is polled across requests.
const timeout = 10_000

/**
 * Vercel deployments are immutable and the function filesystem is read-only, so
 * updating means asking Vercel to build a specific git ref. A Deploy Hook cannot
 * do that — it always deploys its configured branch. This adapter uses the Deploy
 * API with `gitSource` pinned to the release tag and commit, which preserves the
 * "only a verified Release is installable" property from the release contract.
 */
function config() {
  return {
    token: process.env.VERCEL_TOKEN?.trim() || '',
    project: process.env.VERCEL_PROJECT_ID?.trim() || '',
    repo: process.env.VERCEL_REPO_ID?.trim() || '',
    team: process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_TEAM_SLUG?.trim() || '',
  }
}

function missing(): string[] {
  const { token, project, repo } = config()
  const absent: string[] = []
  if (!token) absent.push('VERCEL_TOKEN')
  if (!project) absent.push('VERCEL_PROJECT_ID')
  if (!repo) absent.push('VERCEL_REPO_ID')
  return absent
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const { token, team } = config()
  if (!token) throw new UpdateAdapterError('Adapter Vercel belum dikonfigurasi.')
  const url = new URL(`${api}${path}`)
  if (team) url.searchParams.set(team.startsWith('team_') ? 'teamId' : 'slug', team)
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  })
}

function rejected(status: number, action: string) {
  if (status === 401 || status === 403)
    return new UpdateAdapterError('Token Vercel ditolak. Periksa cakupan token untuk proyek ini.')
  if (status === 404) return new UpdateAdapterError(`Proyek Vercel tidak ditemukan (${action}).`)
  if (status === 429)
    return new UpdateAdapterError('Batas permintaan API Vercel tercapai. Coba lagi nanti.')
  return new UpdateAdapterError(`Vercel menolak permintaan (status ${status}).`)
}

type DeploymentBody = {
  id?: unknown
  url?: unknown
  readyState?: unknown
  alias?: unknown
  aliasError?: unknown
  gitSource?: { ref?: unknown; sha?: unknown } | null
}

async function body(response: Response): Promise<DeploymentBody> {
  return (await response.json().catch(() => ({}))) as DeploymentBody
}

export const vercelAdapter: DeploymentAdapter = {
  id: 'vercel',
  label: 'Vercel',
  missing,
  async start(target: DeploymentTarget) {
    const absent = missing()
    if (absent.length)
      throw new UpdateAdapterError(`Konfigurasi Vercel belum lengkap: ${absent.join(', ')}.`)
    const { project, repo } = config()
    const response = await call('/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1', {
      method: 'POST',
      body: JSON.stringify({
        name: project,
        project,
        target: 'production',
        // The tag and the commit are both pinned: a moved tag cannot make the
        // provider build something other than the release that was verified.
        gitSource: { type: 'github', repoId: repo, ref: target.tag, sha: target.commit },
        gitMetadata: { commitRef: target.tag, commitSha: target.commit },
        withLatestCommit: false,
        meta: { nextpressVersion: target.version, nextpressTag: target.tag },
      }),
    })
    if (!response.ok) throw rejected(response.status, 'membuat deployment')
    const created = await body(response)
    if (typeof created.id !== 'string' || !created.id)
      throw new UpdateAdapterError('Vercel tidak mengembalikan ID deployment.')
    return {
      externalId: created.id,
      externalUrl: typeof created.url === 'string' ? `https://${created.url}` : undefined,
    }
  },
  async status(externalId: string): Promise<DeploymentState> {
    if (!/^dpl_[A-Za-z0-9]+$/.test(externalId))
      throw new UpdateAdapterError('ID deployment tidak valid.')
    const response = await call(`/v13/deployments/${encodeURIComponent(externalId)}`)
    if (!response.ok) throw rejected(response.status, 'membaca status deployment')
    const deployment = await body(response)
    const state = typeof deployment.readyState === 'string' ? deployment.readyState : ''
    if (state === 'READY') {
      // A deployment that built is not necessarily the tag that was requested.
      const sha = typeof deployment.gitSource?.sha === 'string' ? deployment.gitSource.sha : ''
      if (typeof deployment.aliasError === 'string' && deployment.aliasError)
        return { state: 'failed', detail: `Alias produksi gagal: ${deployment.aliasError}` }
      // The production alias is what the running site answers on. The preview URL
      // is not usable for the health check: Deployment Protection may guard it.
      const alias = Array.isArray(deployment.alias)
        ? deployment.alias.find((item): item is string => typeof item === 'string')
        : undefined
      const detail = [sha && `commit ${sha.slice(0, 12)}`, alias && `https://${alias}`]
        .filter(Boolean)
        .join(' · ')
      return { state: 'ready', detail: detail || undefined }
    }
    if (state === 'ERROR' || state === 'CANCELED')
      return { state: 'failed', detail: `Deployment ${state.toLowerCase()} di Vercel.` }
    return { state: 'pending', detail: state || undefined }
  },
}
