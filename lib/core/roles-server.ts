import 'server-only'
import { cache } from 'react'
import { getRequestOptions } from './options-server'
import { createRoleRegistry } from './roles'

export const getRequestRoles = cache(async () =>
  createRoleRegistry(await getRequestOptions().getOption('core:roles')),
)
