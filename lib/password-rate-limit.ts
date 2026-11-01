import { sql } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { rateLimit } from '@/lib/db/auth-schema'
import { newId } from '@/lib/db/ids'

export async function consumePasswordAttempt(
  db: Pick<ReturnType<typeof getDb>, 'insert'>,
  userId: string,
) {
  const now = Date.now()
  // Reserve before hashing, atomically: parallel requests cannot all pass a read.
  const [limit] = await db
    .insert(rateLimit)
    .values({ id: newId(), key: `pwd-check:${userId}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${rateLimit.lastRequest} <= ${now - 60000} then 1 else least(${rateLimit.count} + 1, 6) end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} <= ${now - 60000} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count })
  if (!limit || limit.count > 5)
    throw new Error('Terlalu banyak percobaan kata sandi. Coba lagi dalam satu menit.')
}
