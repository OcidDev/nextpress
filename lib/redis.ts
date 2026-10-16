import { Redis } from '@upstash/redis'
import { serverEnv } from '@/lib/env'

/**
 * Redis dipakai sebagai penghitung view live; angka permanen tetap di Postgres
 * dan di-flush berkala.
 *
 * Redis bersifat opsional: bila env belum diisi, fitur yang bergantung padanya
 * harus menurun dengan rapi, bukan menggagalkan render halaman.
 */

let client: Redis | null | undefined

export function redis(): Redis | null {
  if (client !== undefined) return client

  if (!process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_TOKEN) {
    client = null
    return client
  }

  const env = serverEnv()
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    client = null
    return client
  }

  client = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  })
  return client
}
