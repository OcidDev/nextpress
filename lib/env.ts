import { z } from 'zod'

/**
 * Validasi environment variable saat modul pertama diimpor.
 * Tujuannya: salah konfigurasi ketahuan saat build, bukan saat pembaca
 * membuka halaman.
 */

const optionalValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

const serverSchema = z
  .object({
    DATABASE_URL: z.string().url('DATABASE_URL harus URL Postgres yang sah'),
    UPSTASH_REDIS_REST_URL: optionalValue(z.string().url()),
    UPSTASH_REDIS_REST_TOKEN: optionalValue(z.string().min(1)),
    CRON_SECRET: optionalValue(z.string().min(16)),
    REVALIDATE_SECRET: optionalValue(z.string().min(16)),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .refine((env) => Boolean(env.UPSTASH_REDIS_REST_URL) === Boolean(env.UPSTASH_REDIS_REST_TOKEN), {
    message: 'URL dan token Upstash harus diisi bersama',
    path: ['UPSTASH_REDIS_REST_TOKEN'],
  })

const clientSchema = z.object({
  NEXT_PUBLIC_MEDIA_MAX_MB: z.coerce.number().int().min(1).max(5).default(5),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url('NEXT_PUBLIC_SITE_URL harus URL absolut')
    .default('http://localhost:3000'),
  NEXT_PUBLIC_GA_ID: optionalValue(z.string().regex(/^G-[A-Z0-9]+$/, 'Format GA4 tidak sah')),
  NEXT_PUBLIC_ADSENSE_ID: optionalValue(
    z.string().regex(/^ca-pub-\d+$/, 'Format AdSense tidak sah'),
  ),
})

function format(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
}

/**
 * Variabel publik divalidasi di server maupun client. Harus ditulis sebagai
 * literal `process.env.NEXT_PUBLIC_*` agar ikut di-inline oleh bundler.
 */
const clientParsed = clientSchema.safeParse({
  NEXT_PUBLIC_MEDIA_MAX_MB: process.env.NEXT_PUBLIC_MEDIA_MAX_MB,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
  NEXT_PUBLIC_ADSENSE_ID: process.env.NEXT_PUBLIC_ADSENSE_ID,
})

if (!clientParsed.success) {
  throw new Error(`Environment variable publik tidak sah:\n${format(clientParsed.error)}`)
}

export const publicEnv = clientParsed.data

/**
 * Variabel rahasia hanya divalidasi di server. Diakses lewat getter agar
 * import dari Client Component tidak ikut memicu validasi.
 */
let serverCache: z.infer<typeof serverSchema> | null = null

export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() tidak boleh dipanggil dari browser')
  }
  if (serverCache) return serverCache

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(`Environment variable server tidak sah:\n${format(parsed.error)}`)
  }
  serverCache = parsed.data
  return serverCache
}
