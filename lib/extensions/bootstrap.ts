import 'server-only'
import { cache } from 'react'
import { builtinExtensions } from '@/extensions'
import { getHookRegistry } from './hooks'
import { dbExtensionHealthStore } from './health-query'
import { bootExtensionSet, type BootReport, type ExtensionSources } from './kernel'
import { getCoreRegistry } from '@/lib/core/runtime-registry'

/**
 * Penyambungan kernel ke aplikasi (sprint EXT-02).
 *
 * Berkas ini yang menyentuh sisi server: membaca sumber ekstensi dari repo,
 * memakai penyimpanan kesehatan berbasis database, dan membungkus boot dengan
 * `cache()` agar berjalan **sekali per request**. Logika urutan dan recovery mode
 * ada di `kernel.ts` yang murni dan dapat diuji tanpa database.
 *
 * Tanpa ekstensi terdaftar (keadaan repo saat ini), boot tidak memakai query
 * database sama sekali dan tidak mengubah output apa pun — hanya `await` singkat.
 */

/**
 * Sumber ekstensi per tahap.
 *
 * Dua tahap terakhir sengaja masih kosong dan itu bukan tempat penampung
 * sementara:
 *
 * - `plugins`: widget tetap berjalan di iframe. API 2 contentSeo memakai registry
 *   runtime tepercaya di lib/plugins/content-seo-server.ts, dengan kontrak editor,
 *   simpan, dan metadata tersendiri; tidak memuat JavaScript ZIP ke kernel.
 * - `themes`: sistem tema belum ada; paket tema dan `theme.json` direncanakan di
 *   EXT-04–EXT-06.
 *
 * Karena keduanya statis dan kosong, memuatnya tidak memerlukan query database.
 */
async function loadExtensionSources(): Promise<ExtensionSources> {
  return { builtin: builtinExtensions, plugins: [], themes: [] }
}

/**
 * Id ekstensi yang dapat dimuat build ini. Dipakai dasbor untuk menandai catatan
 * pemulihan yang sudah tidak ada modulnya (mis. ekstensi dihapus dari repo) —
 * catatan itu tetap dapat dibersihkan admin, tetapi tidak boleh tampak seperti
 * ekstensi yang sedang bermasalah.
 */
export function knownExtensionIds(): string[] {
  return builtinExtensions.map((module) => module.id)
}

/**
 * Boot ekstensi untuk request yang sedang berjalan.
 *
 * Panggil sebelum **memakai** hook apa pun (filter maupun action). `cache()`
 * membuatnya sekali per request, dan `HookRegistry.markBooted()` membuatnya
 * idempoten bila tetap terpanggil lebih dari sekali.
 *
 * Di luar React (tes, skrip) `cache()` tidak menyimpan apa pun; untuk keperluan
 * itu pakai `bootExtensionSet` langsung dengan registry sendiri.
 */
export const bootExtensions = cache(async (): Promise<BootReport> =>
  bootExtensionSet(getHookRegistry(), {
    core: getCoreRegistry(),
    sources: await loadExtensionSources(),
    store: dbExtensionHealthStore,
  }),
)
