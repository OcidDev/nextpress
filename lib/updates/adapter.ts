import 'server-only'

/**
 * A deployment adapter applies a verified release to the installation that is
 * running. It is deliberately small: the update code never receives a URL or a
 * shell command from the browser, only a validated release manifest.
 */
export type DeploymentTarget = {
  version: string
  tag: string
  commit: string
}

export type DeploymentStart = {
  externalId: string
  externalUrl?: string
}

export type DeploymentState =
  | { state: 'pending'; detail?: string }
  | { state: 'ready'; detail?: string }
  | { state: 'failed'; detail: string }

export type DeploymentAdapter = {
  /** Provider name stored on the job row. */
  id: string
  /** Human-readable setup hint shown when the adapter is not configured. */
  label: string
  /** Why this installation cannot update itself through this adapter, if any. */
  missing(): string[]
  start(target: DeploymentTarget): Promise<DeploymentStart>
  status(externalId: string): Promise<DeploymentState>
}

export class UpdateAdapterError extends Error {}
