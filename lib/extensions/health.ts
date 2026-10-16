import { z } from 'zod'

/**
 * Catatan kesehatan ekstensi (sprint EXT-02) — dasar *recovery mode*.
 *
 * Ekstensi yang gagal saat boot dicatat; setelah `failureThreshold` kegagalan
 * berturut-turut kernel melewatinya sampai admin menekan "Coba lagi" di dasbor.
 * Ini padanan *recovery mode* WordPress: situs tetap dirender tanpa ekstensi yang
 * bermasalah, alih-alih gagal total.
 *
 * Berkas ini **murni** (tanpa `server-only`, tanpa database) supaya penyimpanan
 * dapat diganti di tes dan skrip. Implementasi berbasis database ada di
 * `health-query.ts`.
 */

export type ExtensionHealth = {
  /** Kegagalan boot berturut-turut; diakumulasi lintas proses lewat database. */
  failures: number
  /** `true` = kernel melewati ekstensi ini sampai dicoba lagi oleh admin. */
  paused: boolean
  /** Pesan galat terakhir, untuk pemberitahuan ke admin. */
  lastError: string
  /** Kapan ekstensi dijeda (ISO 8601), `null` bila tidak dijeda. */
  pausedAt: string | null
}

/**
 * Penyimpanan catatan kesehatan. `write(id, null)` menghapus catatan — dipakai
 * setelah boot berhasil dan saat admin mencoba lagi.
 */
export type ExtensionHealthStore = {
  read(): Promise<Record<string, ExtensionHealth>>
  write(id: string, health: ExtensionHealth | null): Promise<void>
}

const healthEntrySchema = z.object({
  failures: z.number().int().min(0),
  paused: z.boolean(),
  lastError: z.string(),
  pausedAt: z.string().nullable(),
})

/** Nilai option `extensions:health`, dengan proyeksi legacy ke cms_settings. */
export const extensionHealthSchema = z.object({
  format: z.literal(1),
  extensions: z.record(z.string(), healthEntrySchema),
})

export function emptyExtensionHealth(): Record<string, ExtensionHealth> {
  return {}
}

/**
 * Membaca catatan kesehatan dari nilai mentah database.
 *
 * Data yang rusak **tidak** melempar galat: catatan kesehatan adalah alat bantu
 * pemulihan, jadi nilai yang tidak terbaca diperlakukan sebagai "tidak ada
 * catatan" (semua ekstensi dianggap sehat) daripada menjatuhkan render halaman
 * publik yang tidak ada hubungannya dengan masalah itu.
 */
export function parseExtensionHealth(value: unknown): Record<string, ExtensionHealth> {
  const parsed = extensionHealthSchema.safeParse(value)
  if (parsed.success) return parsed.data.extensions
  if (value !== undefined && value !== null)
    console.error('[extensions] catatan kesehatan ekstensi tidak terbaca; diabaikan', parsed.error)
  return emptyExtensionHealth()
}

/**
 * Penyimpanan di memori untuk tes dan skrip. `writes` menghitung berapa kali
 * penyimpanan ditulis — dipakai tes untuk membuktikan kebijakan "tulis hanya saat
 * berubah", yang menjaga jalur render publik tetap bebas tulis.
 */
export function createMemoryHealthStore(
  initial: Record<string, ExtensionHealth> = {},
): ExtensionHealthStore & { state: Record<string, ExtensionHealth>; writes: number } {
  const store = {
    state: { ...initial },
    writes: 0,
    async read() {
      return { ...store.state }
    },
    async write(id: string, health: ExtensionHealth | null) {
      store.writes += 1
      if (health) store.state[id] = health
      else delete store.state[id]
    },
  }
  return store
}
