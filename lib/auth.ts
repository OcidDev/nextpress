import 'server-only'
import { betterAuth, APIError } from 'better-auth'
import { eq } from 'drizzle-orm'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDb } from '@/lib/db'
import * as schema from '@/lib/db/auth-schema'
import { getRequestRoles } from '@/lib/core/roles-server'
import { clientIpHeader } from '@/lib/client-ip'

let instance: ReturnType<typeof createAuth> | undefined
function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32)
    throw new Error('BETTER_AUTH_SECRET minimal 32 karakter diperlukan')
  const baseURL =
    process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return betterAuth({
    appName: 'NextPress',
    baseURL,
    secret,
    database: drizzleAdapter(getDb(), { provider: 'pg', schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60, cookieCache: { enabled: false } },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [current] = await getDb()
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
            if (!current?.active || !(await getRequestRoles()).has(current.role, 'read'))
              throw new APIError('FORBIDDEN', {
                message: 'Akun tidak aktif atau tidak memiliki akses CMS.',
              })
          },
        },
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'author', input: false },
        active: { type: 'boolean', defaultValue: true, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },
    advanced: {
      cookiePrefix: 'nextpress',
      useSecureCookies: baseURL.startsWith('https://'),
      ipAddress: { ipAddressHeaders: [clientIpHeader()] },
    },
  })
}
export function getAuth() {
  return (instance ??= createAuth())
}
