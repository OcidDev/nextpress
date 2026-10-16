import 'server-only'
import { sql } from 'drizzle-orm'
import { hasDatabase } from '@/lib/db'
import { getRequestOptions, withOptionsTransaction } from '@/lib/core/options-server'
import {
  extensionHealthSchema,
  parseExtensionHealth,
  type ExtensionHealth,
  type ExtensionHealthStore,
} from './health'

/**
 * Penyimpanan catatan kesehatan ekstensi di database (sprint EXT-02).
 *
 * Option `cms_options` (diproyeksikan ke `cms_settings`) dengan nama `extensions:health` memuat peta
 * id-ekstensi → `{ failures, paused, lastError, pausedAt }`. Mengikuti pola baris
 * state lain di repo ini (`appearance:active`, `appearance:draft`).
 *
 * Catatan penting soal penguncian: transaksi memakai advisory lock khusus option health,
 * tanpa mengambil lock `cms-appearance` milik Tampilan/plugin. Alasannya, penulisan catatan ini terjadi di jalur render
 * publik; dengan tidak pernah meminta kunci advisory itu, tidak ada urutan kunci
 * yang bisa membentuk siklus dengan transaksi Tampilan (advisory → baris).
 */
export const extensionHealthId = 'extensions:health'

export async function readExtensionHealth(): Promise<Record<string, ExtensionHealth>> {
  if (!hasDatabase()) return {}
  return parseExtensionHealth(await getRequestOptions().getOption(extensionHealthId))
}

/**
 * Menulis (atau menghapus, bila `health` `null`) catatan satu ekstensi.
 *
 * Baca-ubah-tulis di dalam transaksi: dua request yang gagal bersamaan
 * terserialisasi oleh kunci khusus health, jadi catatan satu ekstensi tidak menghapus
 * catatan ekstensi lain. Modul ini **tidak** memeriksa izin — pemanggilnya adalah
 * kernel (jalur render, tanpa sesi) dan action admin yang sudah dijaga
 * kapabilitas `activate_plugins`.
 */
export async function writeExtensionHealth(id: string, health: ExtensionHealth | null) {
  if (!hasDatabase()) throw new Error('DATABASE_URL belum dikonfigurasi')
  await withOptionsTransaction(
    async (tx, options) => {
      // Serializes even the first write, when no row exists yet. Distinct from
      // the appearance lock; health never acquires that lock.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${'cms-option:' + extensionHealthId}))`,
      )
      const extensions = { ...parseExtensionHealth(await options.getOption(extensionHealthId)) }
      if (health) extensions[id] = health
      else delete extensions[id]
      await options.updateOption(
        extensionHealthId,
        extensionHealthSchema.parse({ format: 1, extensions }),
      )
    },
    { notify: false },
  ) // Kernel health writes must not recursively boot the kernel.
}

/** Ekstensi yang sedang dijeda, untuk pemberitahuan mode pemulihan di dasbor. */
export async function listPausedExtensions(): Promise<
  { id: string; lastError: string; pausedAt: string | null }[]
> {
  const health = await readExtensionHealth()
  return Object.entries(health)
    .filter(([, entry]) => entry.paused)
    .map(([id, entry]) => ({ id, lastError: entry.lastError, pausedAt: entry.pausedAt }))
}

/** Penghapusan catatan satu ekstensi; jalur "Coba lagi" di dasbor. */
export async function clearExtensionHealth(id: string) {
  await writeExtensionHealth(id, null)
}

/** Penyimpanan berbasis database untuk kernel; lihat `ExtensionHealthStore`. */
export const dbExtensionHealthStore: ExtensionHealthStore = {
  read: readExtensionHealth,
  write: writeExtensionHealth,
}
