import { jsonValue, optionNameSchema, type JsonValue } from './options'

export const MAX_TRANSIENT_TTL = 30 * 24 * 60 * 60
export interface TransientStore {
  get(name: string): Promise<JsonValue | undefined>
  set(name: string, value: JsonValue, ttlSeconds: number): Promise<void>
  delete(name: string): Promise<void>
}

/** PostgreSQL is authoritative in S1. No Redis failover can resurrect stale data. */
export function createTransientsApi(store: TransientStore) {
  return {
    getTransient: (name: string) => store.get(optionNameSchema.parse(name)),
    async setTransient(name: string, value: unknown, ttlSeconds: number) {
      optionNameSchema.parse(name)
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TRANSIENT_TTL)
        throw new Error('TTL transient harus 1 detik sampai 30 hari.')
      await store.set(name, jsonValue(value), ttlSeconds)
    },
    deleteTransient: (name: string) => store.delete(optionNameSchema.parse(name)),
  }
}
