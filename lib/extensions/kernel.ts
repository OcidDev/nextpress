import type { HookRegistry } from './hooks'
import type { ExtensionHealthStore, ExtensionHealth } from './health'
import { createCoreRegistry, type CoreRegistry } from '@/lib/core/registry'

/**
 * Kernel ekstensi (sprint EXT-02) — padanan `wp-settings.php`.
 *
 * Urutan boot, meniru WordPress:
 *
 * 1. ekstensi bawaan (padanan `mu-plugins`) → action `extensions_loaded`
 * 2. plugin aktif → action `plugins_loaded`
 * 3. tema aktif (induk dulu, lalu child) → action `after_setup_theme`
 * 4. action `init`
 *
 * Setiap tahap memuat daftar `ExtensionModule` dan memanggil `setup`, tempat
 * ekstensi mendaftarkan hook ke registry request. Berkas ini **murni**: tidak
 * mengimpor `server-only`, tidak menyentuh database, dan menerima daftar sumber
 * serta penyimpanan kesehatan sebagai argumen. Itu yang membuat urutan tahap,
 * isolasi galat, dan recovery mode dapat diuji langsung di Node. Penyambungan ke
 * aplikasi (sumber dari repo, penyimpanan di database, cache per request) ada di
 * `bootstrap.ts`.
 *
 * Urutan pemuatan penting dan tidak boleh diubah: ekstensi dengan prioritas hook
 * yang sama dijalankan sesuai urutan pendaftaran, jadi modul yang dimuat lebih
 * dulu juga berjalan lebih dulu pada prioritas yang sama.
 */

/** Tahap pemuatan; tema memuat induk lebih dulu, lalu child. */
export type ExtensionStage = 'builtin' | 'plugin' | 'theme'

export type ExtensionContext = {
  /** Content type/status registry in this kernel scope (WP-03). */
  core: CoreRegistry
  /** Registry request tempat ekstensi mendaftarkan filter/action. */
  registry: HookRegistry
  /** Id ekstensi; dipakai untuk log dan catatan kesehatan. */
  id: string
  /** Versi yang dideklarasikan modul. */
  version: string
  stage: ExtensionStage
}

/**
 * Satu ekstensi yang dapat dimuat kernel.
 *
 * `setup` adalah padanan "berkas plugin dieksekusi": tempat `addFilter`/`addAction`
 * dipanggil. Ia boleh mengembalikan promise; kegagalan (sinkron maupun async)
 * diisolasi kernel dan tidak menghentikan boot tahap berikutnya.
 */
export type ExtensionModule = {
  id: string
  version: string
  setup(context: ExtensionContext): void | Promise<void>
}

/** Sumber per tahap. Urutan di dalam array menentukan urutan pemuatan. */
export type ExtensionSources = {
  builtin: ExtensionModule[]
  plugins: ExtensionModule[]
  themes: ExtensionModule[]
}

export type BootReport = {
  /** `true` bila registry ini sudah pernah di-boot; boot kedua tidak melakukan apa pun. */
  alreadyBooted: boolean
  /** Id yang `setup`-nya selesai tanpa galat, berurutan. */
  booted: string[]
  /** Id yang dilewati karena sedang dijeda (recovery mode). */
  skipped: string[]
  /** Id yang gagal di request ini; situs tetap dirender tanpanya. */
  failed: string[]
  /**
   * Query database yang dipakai kernel ini sendiri (baca catatan kesehatan +
   * tulis perubahan status). Bukan total query aplikasi. Target sprint: ≤ 2 per
   * request publik — tanpa ekstensi terdaftar angkanya 0.
   */
  dbQueries: number
}

/** Kegagalan boot berturut-turut sebelum sebuah ekstensi dijeda. */
export const failureThreshold = 3

/** Panjang maksimum pesan galat yang disimpan untuk pemberitahuan admin. */
const maxErrorMessage = 300

function log(message: string, detail?: unknown) {
  console.error(`[extensions] ${message}`, detail ?? '')
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim().slice(0, maxErrorMessage)
}

/**
 * Menjalankan boot untuk satu registry. Idempoten: registry yang sudah di-boot
 * tidak di-boot ulang (lihat `HookRegistry.markBooted`), sehingga memanggil
 * `bootExtensions()` dari beberapa tempat dalam satu request tidak mendaftarkan
 * hook dua kali.
 */
export async function bootExtensionSet(
  registry: HookRegistry,
  options: { sources: ExtensionSources; store: ExtensionHealthStore; core?: CoreRegistry },
): Promise<BootReport> {
  if (registry.isBooted())
    return { alreadyBooted: true, booted: [], skipped: [], failed: [], dbQueries: 0 }
  registry.markBooted()

  const { sources, store } = options
  const core = options.core ?? createCoreRegistry()
  const report: BootReport = {
    alreadyBooted: false,
    booted: [],
    skipped: [],
    failed: [],
    dbQueries: 0,
  }
  const loadable = [...sources.builtin, ...sources.plugins, ...sources.themes]
  // Tanpa ekstensi terdaftar, kernel tidak menyentuh database sama sekali.
  const health = loadable.length ? await readHealth(store, report) : {}

  const persist = async (id: string, state: ExtensionHealth | null) => {
    report.dbQueries += 1
    try {
      await store.write(id, state)
    } catch (error) {
      // Pencatatan kesehatan tidak boleh menjatuhkan render halaman publik.
      log(`${id}: catatan kesehatan gagal ditulis`, error)
    }
  }

  const runStage = async (stage: ExtensionStage, list: ExtensionModule[]) => {
    const booted: string[] = []
    for (const extension of list) {
      const recorded = health[extension.id]
      if (recorded?.paused) {
        report.skipped.push(extension.id)
        console.warn(
          `[extensions] ${extension.id}: dilewati karena dijeda setelah ${recorded.failures} kegagalan`,
        )
        continue
      }
      try {
        await extension.setup({
          core,
          registry,
          id: extension.id,
          version: extension.version,
          stage,
        })
        report.booted.push(extension.id)
        booted.push(extension.id)
        // Sembuh: catatan lama dihapus supaya ekstensi tidak dianggap gagal lagi.
        if (recorded?.failures) {
          await persist(extension.id, null)
          console.warn(`[extensions] ${extension.id}: boot berhasil, catatan kegagalan dihapus`)
        }
      } catch (error) {
        report.failed.push(extension.id)
        const failures = (recorded?.failures ?? 0) + 1
        const paused = failures >= failureThreshold
        log(`${extension.id}: gagal dimuat (${failures}/${failureThreshold})`, error)
        await persist(extension.id, {
          failures,
          paused,
          lastError: describe(error),
          pausedAt: paused ? new Date().toISOString() : null,
        })
        if (paused)
          log(`${extension.id}: dijeda (mode pemulihan); perbaiki lalu coba lagi dari dasbor`)
      }
    }
    return booted
  }

  const builtin = await runStage('builtin', sources.builtin)
  await registry.doAction('extensions_loaded', { builtin })
  const plugins = await runStage('plugin', sources.plugins)
  await registry.doAction('plugins_loaded', { plugins })
  const themes = await runStage('theme', sources.themes)
  // Induk dimuat lebih dulu, child terakhir: `after_setup_theme` melaporkan tema
  // yang menang, sama seperti `get_stylesheet()` di WordPress.
  await registry.doAction('after_setup_theme', { theme: themes.at(-1) ?? null })
  await registry.doAction('init', { booted: report.booted })
  return report
}

async function readHealth(
  store: ExtensionHealthStore,
  report: BootReport,
): Promise<Record<string, ExtensionHealth>> {
  report.dbQueries += 1
  try {
    return await store.read()
  } catch (error) {
    // Catatan yang tidak terbaca berarti "semua ekstensi dianggap sehat".
    log('catatan kesehatan ekstensi gagal dibaca; semua ekstensi dianggap sehat', error)
    return {}
  }
}
