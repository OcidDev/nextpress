import 'server-only'
import { getRequestOptions } from '@/lib/core/options-server'
import { UpdateAdapterError, type DeploymentAdapter } from './adapter'

export const selfHostedAdapter: DeploymentAdapter = {
  id: 'self-hosted',
  label: 'Server / VPS',
  async missing() {
    const heartbeat = (await getRequestOptions().getOption('updates:worker')) as
      { ready?: boolean; at?: string } | undefined
    return heartbeat?.ready && heartbeat.at && Date.now() - Date.parse(heartbeat.at) < 60_000
      ? []
      : ['Worker pembaruan belum aktif atau belum siap. Ikuti panduan Server / VPS.']
  },
  async start(target) {
    // The persistent job is the queue. Nothing is spawned inside the HTTP request.
    if (!target.release.rollbackSafe)
      throw new UpdateAdapterError(
        'Rilis ini mengubah skema database. Pembaruan memerlukan maintenance oleh operator.',
      )
    return { externalId: `local_${target.jobId}` }
  },
  async status() {
    // The worker owns execution, recovery and completion, independently of browser polling.
    return { state: 'pending' }
  },
}
