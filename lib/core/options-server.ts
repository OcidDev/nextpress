import 'server-only'
import { cache } from 'react'
import { getDb } from '@/lib/db'
import { createPostgresOptionStore } from '@/lib/db/core-store'
import { createCmsOptionRegistry } from './option-definitions'
import { createOptionsApi, type OptionChange, type OptionsApi } from './options'

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

async function notifyChanges(changes: OptionChange[]) {
  if (!changes.length) return
  getRequestOptions().invalidate()
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

