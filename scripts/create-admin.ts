import nextEnv from '@next/env'
import { createInterface } from 'node:readline/promises'
import { randomBytes } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
nextEnv.loadEnvConfig(process.cwd())
const { getDb, getPool } = await import('../lib/db/index')
const { user, account } = await import('../lib/db/auth-schema')
const rl = createInterface({ input: process.stdin, output: process.stdout })
try {
  const name = process.env.ADMIN_NAME || (await rl.question('Nama admin: '))
  const email = process.env.ADMIN_EMAIL || (await rl.question('Email admin: '))
  // Password is read from an environment variable or a hidden terminal prompt.
  let password = process.env.ADMIN_PASSWORD
  if (!password) {
    if (!process.stdin.isTTY) throw new Error('ADMIN_PASSWORD diperlukan pada mode non-interaktif')
    rl.close()
    process.stdout.write('Kata sandi (minimal 12 karakter, tidak ditampilkan): ')
    password = await new Promise<string>((resolve, reject) => {
      let value = ''
      process.stdin.setRawMode(true)
      process.stdin.resume()
      const onData = (chunk: Buffer) => {
        for (const char of chunk.toString()) {
          if (char === '\u0003') {
            cleanup()
            reject(new Error('Dibatalkan'))
            return
          }
          if (char === '\r' || char === '\n') {
            cleanup()
            resolve(value)
            return
          }
          if (char === '\u007f') value = value.slice(0, -1)
          else if (char >= ' ') value += char
        }
      }
      function cleanup() {
        process.stdin.setRawMode(false)
        process.stdin.off('data', onData)
        process.stdin.pause()
        process.stdout.write('\n')
      }
      process.stdin.on('data', onData)
    })
  }
  const input = z
    .object({
      name: z.string().trim().min(1).max(120),
      email: z.email().transform((v) => v.toLowerCase()),
      password: z.string().min(12).max(128),
    })
    .parse({ name, email, password })
  const passwordHash = await hashPassword(input.password)
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(78351021)`)
    if ((await tx.select({ id: user.id }).from(user).limit(1)).length)
      throw new Error('Admin sudah tersedia. Bootstrap hanya boleh dijalankan sekali.')
    const id = randomBytes(16).toString('hex')
    await tx
      .insert(user)
      .values({ id, name: input.name, email: input.email, role: 'administrator', active: true })
    await tx.insert(account).values({
      id: randomBytes(16).toString('hex'),
      userId: id,
      accountId: id,
      providerId: 'credential',
      password: passwordHash,
    })
  })
  console.log('Admin pertama berhasil dibuat. Masuk melalui /admin/login.')
} finally {
  rl.close()
  await getPool().end()
}
