import 'server-only'
import { cache } from 'react'
import { getDb } from '@/lib/db'
import { createPostgresOptionStore, createPostgresTransientStore } from '@/lib/db/core-store'
import { getHookRegistry } from '@/lib/extensions/hooks'
import { bootExtensions } from '@/lib/extensions/bootstrap'
import { createCmsOptionRegistry } from './option-definitions'
import { createOptionsApi, type OptionChange, type OptionsApi } from './options'
import { createTransientsApi } from './transients'

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

async function notifyChanges(changes: OptionChange[]) {
  if (!changes.length) return
  getRequestOptions().invalidate()
  await bootExtensions()
  for (const change of changes) await getHookRegistry().doAction('option_changed', change)
}

/** RSC scope. Route Handlers/CLI can use createOptionsApi with an explicit store. */
export const getRequestOptions = cache(() =>
  createOptionsApi(createPostgresOptionStore(getDb()), createCmsOptionRegistry(), (change) =>
    notifyChanges([change]),
  ),
)

/** Emit hooks and invalidate request reads only after the entire transaction commits. */
export async function withOptionsTransaction<T>(
  run: (tx: Transaction, options: OptionsApi) => Promise<T>,
  { notify = true }: { notify?: boolean } = {},
): Promise<T> {
  const changes: OptionChange[] = []
  const result = await getDb().transaction(async (tx) =>
    run(
      tx,
      createOptionsApi(createPostgresOptionStore(tx), createCmsOptionRegistry(), (change) => {
        changes.push(change)
      }),
    ),
  )
  if (notify) await notifyChanges(changes)
  else getRequestOptions().invalidate()
  return result
}

export function getDatabaseTransients() {
  return createTransientsApi(createPostgresTransientStore(getDb()))
}
