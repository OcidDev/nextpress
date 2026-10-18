import nextEnv from '@next/env'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'
import { readPassword } from './password-prompt'

const isProd = process.argv.includes('--prod') || process.argv.includes('--production')

// Deteksi DATABASE_URL eksplisit atau baca konfigurasi
if (isProd) {
  if (!process.env.DATABASE_URL) {
    const vercelEnvPath = resolve(process.cwd(), '.vercel/.env.production.local')
    if (existsSync(vercelEnvPath)) {
      const content = readFileSync(vercelEnvPath, 'utf8')
      const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m)
      if (match) {
        process.env.DATABASE_URL = match[1]
      }
    }
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL untuk production tidak ditemukan.')
    console.error('Gunakan: DATABASE_URL="postgresql://..." pnpm admin:reset --prod')
    console.error(
      'atau pastikan .vercel/.env.production.local tersedia (jalankan: vercel env pull).',
    )
    process.exit(1)
  }
} else {
  nextEnv.loadEnvConfig(process.cwd(), true)
}

const { getDb, getPool } = await import('../lib/db/index.js')
const { user, account, session } = await import('../lib/db/auth-schema.js')

// Never accept secrets in argv (shell history / process listings) or supply defaults.
if (process.argv.some((arg) => arg === '--password' || arg.startsWith('--password=')))
  throw new Error('Gunakan prompt tersembunyi atau NEW_ADMIN_PASSWORD, bukan --password.')
const emailArg = process.argv.find((arg) => arg.startsWith('--email='))?.slice('--email='.length)
const targetEmail = z
  .email()
  .parse((emailArg || process.env.ADMIN_EMAIL || '').trim().toLowerCase())
const newPassword = z
  .string()
  .min(12)
  .max(128)
  .parse(process.env.NEW_ADMIN_PASSWORD || (await readPassword()))

console.log(`Menghubungkan ke database [${isProd ? 'PRODUCTION' : 'LOCAL'}]...`)

const db = getDb()
const [adminUser] = await db.select().from(user).where(eq(user.email, targetEmail))

if (!adminUser || !['admin', 'administrator'].includes(adminUser.role)) {
  console.error('Akun administrator dengan email tersebut tidak ditemukan.')
  await getPool().end()
  process.exit(1)
}

const hashedPassword = await hashPassword(newPassword)

await db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(78351021)`)

  // Reset credentials only; preserve the account's role and active status.

  // Update password credential
  const updatedAccounts = await tx
    .update(account)
    .set({ password: hashedPassword, updatedAt: new Date() })
    .where(and(eq(account.userId, adminUser.id), eq(account.providerId, 'credential')))
    .returning({ id: account.id })

  if (updatedAccounts.length === 0) {
    // Jika belum ada record account credential, buatkan
    const { randomBytes } = await import('node:crypto')
    const id = randomBytes(16).toString('hex')
    await tx.insert(account).values({
      id,
      userId: adminUser.id,
      accountId: adminUser.id,
      providerId: 'credential',
      password: hashedPassword,
    })
  }

  // Bersihkan seluruh sesi lama
  await tx.delete(session).where(eq(session.userId, adminUser.id))
})

console.log(
  `\n✔ Sukses! Password untuk ${targetEmail} di [${isProd ? 'PRODUCTION' : 'LOCAL'}] berhasil direset.`,
)
console.log(`Email        : ${targetEmail}`)

await getPool().end()
