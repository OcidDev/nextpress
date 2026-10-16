import 'server-only'
import { currentUserCan, type Actor, type ObjectCapability, type PermissionObject } from './roles'
import { getRequestRoles } from './roles-server'

export async function requireObjectPermission(
  actor: Actor,
  cap: ObjectCapability,
  object: PermissionObject,
) {
  if (!currentUserCan(actor, cap, object, await getRequestRoles()))
    throw new Error('Anda tidak memiliki izin untuk mengelola konten ini.')
}
