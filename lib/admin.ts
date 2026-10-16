import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuth } from '@/lib/auth'
import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { user } from '@/lib/db/auth-schema'
import { type Capability } from '@/lib/extensions/capabilities'
import { getRequestRoles } from '@/lib/core/roles-server'
import { canonicalRole, type PrimitiveCapability } from '@/lib/core/roles'

export const getCmsSession = cache(async () => {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return null
  // Read current privileges instead of trusting a previously issued session.
  const [current] = await getDb().select().from(user).where(eq(user.id, session.user.id))
  if (!current?.active) return null
  const roles = await getRequestRoles()
  const definition = roles.get(current.role)
  if (!definition?.capabilities.includes('read')) return null
  return {
    ...session,
    user: {
      ...session.user,
      ...current,
      role: canonicalRole(current.role),
      capabilities: definition.capabilities,
      roleLabel: definition.label,
    },
  }
})

export const getAdminSession = cache(async () => {
  const session = await getCmsSession()
  return session?.user.capabilities.includes('manage_options') ? session : null
})

export async function requireCmsUser() {
  const session = await getCmsSession()
  if (!session) redirect('/admin/login')
  return session
}

export async function requireAdmin() {
  const session = await requireCmsUser()
  if (!session.user.capabilities.includes('manage_options')) redirect('/admin?denied=1')
  return session
}

/** Resolve current server privileges for both pages and forged action requests. */
export async function requireCapability(capability: PrimitiveCapability | Capability) {
  const session = await requireCmsUser()
  if (!session.user.capabilities.includes(capability)) redirect('/admin?denied=1')
  return session
}
