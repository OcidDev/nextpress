import { cache } from 'react'
import {
  validateHookValue,
  type ActionHookName,
  type ActionValues,
  type FilterHookName,
  type FilterValues,
  type HookName,
} from './hook-types'

/**
 * Hook API (sprint EXT-01) — padanan `add_action`/`apply_filters` WordPress.
 *
 * Aturan yang berlaku untuk semua fungsi di bawah:
 *
 * - **Prioritas** menentukan urutan jalan; bawaan `10` (angka kecil lebih dulu).
 *   Di antara prioritas yang sama, urutan mengikuti urutan pendaftaran dan tidak
 *   berubah setelahnya.
 * - **Callback boleh async.** Nilai kembaliannya di-`await`; `applyFilters`
 *   meneruskan hasilnya ke callback berikutnya (rantai), `doAction` mengabaikannya.
 * - **Filter wajib mengembalikan nilai yang sesuai tipe hook-nya.** Callback yang
 *   tidak mengembalikan apa pun (lupa `return`) atau mengembalikan tipe lain
 *   dicatat ke log server dan **tidak** dipakai: rantai lanjut dari nilai sah
 *   terakhir. Ini berbeda dari WordPress, yang menimpa nilai dengan `null` dan
 *   membuat halaman rusak; di sini filter yang salah lebih baik tidak berefek
 *   daripada merusak halaman. Filter yang hanya ingin mengamati sebaiknya memakai
 *   action, bukan filter.
 * - **Satu callback yang gagal tidak menghentikan sisanya.** Galatnya dicatat ke
 *   log server, lalu callback berikutnya tetap dijalankan.
 * - **Ada anggaran waktu per hook** (lihat `hookBudgets`).
 * - **Registry terpisah per request** (lihat `getHookRegistry`), jadi tidak ada
 *   state yang bocor antar-pengguna di serverless.
 *
 * Berkas ini sengaja **tidak** mengimpor `server-only`: modul ini murni logika dan
 * harus dapat diuji langsung di Node oleh Playwright (kebalikan `lib/content/metadata.ts`
 * yang memang server-only).
 */

/** Prioritas bawaan, sama dengan WordPress. */
export const DEFAULT_PRIORITY = 10

/**
 * Anggaran waktu total untuk seluruh callback satu hook, dalam milidetik.
 *
 * Filter render dijalankan di jalur render halaman, jadi anggarannya ketat;
 * action dijalankan setelah pekerjaan utama selesai (simpan artikel, moderasi),
 * jadi anggarannya lebih longgar. Angka ini pembatas atas, bukan target: tanpa
 * ekstensi aktif tidak ada waktu yang terpakai sama sekali.
 *
 * Catatan penting: anggaran ini hanya dapat menghentikan menunggu, bukan
 * menghentikan pekerjaan. Callback yang sudah mulai tetap berjalan sampai selesai
 * di latar belakang dan hasilnya diabaikan. Callback yang **memblokir utas secara
 * sinkron** (loop tanpa `await`) tidak dapat dihentikan oleh mekanisme ini.
 */
export const hookBudgets: Record<HookName, number> = {
  option_changed: 2000,
  the_content: 250,
  the_title: 100,
  document_title: 100,
  body_class: 50,
  head_tags: 100,
  post_card: 250,
  widget_areas: 250,
  admin_menu: 100,
  post_saved: 2000,
  post_published: 2000,
  comment_approved: 2000,
  plugin_activated: 2000,
  // Tahap boot (EXT-02) berjalan sebelum render; pendengar `init` biasanya
  // melakukan pekerjaan penyiapan, jadi anggarannya lebih longgar daripada filter
  // render. Tanpa ekstensi terdaftar, tahap ini tidak memakai waktu sama sekali.
  extensions_loaded: 500,
  plugins_loaded: 500,
  after_setup_theme: 500,
  init: 1000,
}

/**
 * Tipe callback yang diterima pendaftaran. `never[]` sebagai parameter membuat
 * fungsi apa pun dapat didaftarkan (`(html: string) => string`, `() => {}`, …)
 * tanpa `any`; jenis argumennya ditentukan titik panggil, seperti di WordPress.
 */
export type HookCallback = (...args: never[]) => unknown

type Entry = {
  callback: HookCallback
  priority: number
  /** Urutan pendaftaran lintas-hook, untuk tie-break yang stabil. */
  order: number
}

/** Hasil menjalankan satu callback. `budget` berarti hasilnya diabaikan. */
type CallOutcome =
  | { status: 'ok'; value: unknown }
  | { status: 'error' }
  | { status: 'budget' }

/** Penanda balapan waktu; tidak pernah dapat dikembalikan callback. */
const TIMED_OUT = Symbol('hook-timeout')

function report(hook: HookName, message: string, detail?: unknown) {
  console.error(`[extensions] ${hook}: ${message}`, detail ?? '')
}

/**
 * Satu himpunan callback. Biasanya satu instance per request; `createHookRegistry()`
 * membuat instance lepas untuk tes, skrip, dan pekerjaan latar.
 */
export class HookRegistry {
  private filters = new Map<FilterHookName, Entry[]>()
  private actions = new Map<ActionHookName, Entry[]>()
  private actionCounts = new Map<ActionHookName, number>()
  private order = 0
  private booted = false

  /**
   * Menandai registry ini sudah melewati tahap boot kernel (EXT-02). Dipakai
   * `bootExtensionSet` agar memanggil boot dari beberapa tempat dalam satu
   * request tidak mendaftarkan hook dua kali — pendaftaran ganda akan
   * menjalankan filter dua kali pada nilai yang sama.
   */
  markBooted() {
    this.booted = true
  }

  isBooted(): boolean {
    return this.booted
  }

  addFilter(hook: FilterHookName, callback: HookCallback, priority: number = DEFAULT_PRIORITY) {
    this.insert(this.filters, hook, callback, priority)
  }

  addAction(hook: ActionHookName, callback: HookCallback, priority: number = DEFAULT_PRIORITY) {
    this.insert(this.actions, hook, callback, priority)
  }

  /** Menghapus pendaftaran yang cocok pada callback **dan** prioritasnya. */
  removeFilter(hook: FilterHookName, callback: HookCallback, priority: number = DEFAULT_PRIORITY) {
    return this.remove(this.filters, hook, callback, priority)
  }

  removeAction(hook: ActionHookName, callback: HookCallback, priority: number = DEFAULT_PRIORITY) {
    return this.remove(this.actions, hook, callback, priority)
  }

  hasFilter(hook: FilterHookName): boolean {
    return (this.filters.get(hook)?.length ?? 0) > 0
  }

  hasAction(hook: ActionHookName): boolean {
    return (this.actions.get(hook)?.length ?? 0) > 0
  }

  /** Berapa kali `doAction` dipanggil untuk hook ini, terlepas dari ada callback atau tidak. */
  didAction(hook: ActionHookName): number {
    return this.actionCounts.get(hook) ?? 0
  }

  /**
   * Menjalankan filter berantai: nilai awal dilewatkan ke setiap callback sesuai
   * prioritas, dan hasil sah terakhir menjadi nilai kembalian. Nilai yang tidak
   * lolos skema hook dibuang (dicatat) dan rantai lanjut dari nilai sah terakhir.
   */
  async applyFilters<K extends FilterHookName>(
    hook: K,
    value: FilterValues[K],
    ...args: unknown[]
  ): Promise<FilterValues[K]> {
    const registered = this.filters.get(hook)
    if (!registered?.length) return value
    const deadline = Date.now() + hookBudgets[hook]
    let current: unknown = value
    // Salinan: callback yang mendaftarkan/menghapus hook saat berjalan tidak
    // mengubah daftar yang sedang diiterasi.
    for (const entry of [...registered]) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        report(hook, `anggaran ${hookBudgets[hook]} ms habis; callback berikutnya dilewati`)
        break
      }
      const outcome = await this.call(hook, entry, [current, ...args], remaining)
      if (outcome.status === 'budget') break
      if (outcome.status === 'error') continue
      const check = validateHookValue(hook, outcome.value)
      if (!check.ok) {
        report(hook, 'nilai dari callback diabaikan karena tidak sesuai skema', check.message)
        continue
      }
      current = outcome.value
    }
    return current as FilterValues[K]
  }

  /**
   * Menjalankan action. Payload diperiksa terhadap skema hook lebih dulu; action
   * dengan payload cacat tidak menjalankan satu callback pun (dan itu tercatat,
   * karena berarti ada bug di titik panggil).
   *
   * Mengembalikan jumlah callback yang selesai tanpa galat — berguna untuk tes dan
   * diagnostik; pemanggil di aplikasi boleh mengabaikannya.
   */
  async doAction<K extends ActionHookName>(hook: K, payload: ActionValues[K]): Promise<number> {
    this.actionCounts.set(hook, this.didAction(hook) + 1)
    const registered = this.actions.get(hook)
    if (!registered?.length) return 0
    const check = validateHookValue(hook, payload)
    if (!check.ok) {
      report(hook, 'payload tidak dijalankan karena tidak sesuai skema', check.message)
      return 0
    }
    const deadline = Date.now() + hookBudgets[hook]
    let completed = 0
    for (const entry of [...registered]) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        report(hook, `anggaran ${hookBudgets[hook]} ms habis; callback berikutnya dilewati`)
        break
      }
      const outcome = await this.call(hook, entry, [payload], remaining)
      if (outcome.status === 'budget') break
      if (outcome.status === 'ok') completed += 1
    }
    return completed
  }

  private insert<T extends HookName>(
    map: Map<T, Entry[]>,
    hook: T,
    callback: HookCallback,
    priority: number,
  ) {
    if (!Number.isFinite(priority))
      throw new TypeError(`Prioritas hook ${hook} harus angka terbatas`)
    const list = map.get(hook) ?? []
    const entry: Entry = { callback, priority, order: this.order++ }
    // Sisipkan sebelum entri pertama yang prioritasnya lebih besar; dengan begitu
    // urutan pendaftaran terjaga di antara prioritas yang sama tanpa sortir ulang.
    const index = list.findIndex((item) => item.priority > priority)
    if (index === -1) list.push(entry)
    else list.splice(index, 0, entry)
    map.set(hook, list)
  }

  private remove<T extends HookName>(
    map: Map<T, Entry[]>,
    hook: T,
    callback: HookCallback,
    priority: number,
  ): boolean {
    const list = map.get(hook)
    if (!list) return false
    const index = list.findIndex((item) => item.callback === callback && item.priority === priority)
    if (index === -1) return false
    list.splice(index, 1)
    if (!list.length) map.delete(hook)
    return true
  }

  private async call(
    hook: HookName,
    entry: Entry,
    args: unknown[],
    timeoutMs: number,
  ): Promise<CallOutcome> {
    // `HookCallback` menerima `never[]` agar fungsi bertipe apa pun dapat
    // didaftarkan; pada titik ini argumennya sudah disusun titik panggil.
    const callable = entry.callback as (...callArgs: unknown[]) => unknown
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // Dijadwalkan sebagai microtask supaya galat sinkron dan galat async
      // tertangkap lewat jalur yang sama.
      const pending = Promise.resolve().then(() => callable(...args))
      const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
      })
      const outcome = await Promise.race([pending, timeout])
      if (outcome === TIMED_OUT) {
        report(hook, `callback melewati sisa anggaran ${timeoutMs} ms; hasilnya diabaikan`)
        return { status: 'budget' }
      }
      return { status: 'ok', value: outcome }
    } catch (error) {
      report(hook, 'callback gagal dan dilewati', error)
      return { status: 'error' }
    } finally {
      clearTimeout(timer)
    }
  }
}

const requestRegistry = cache(() => new HookRegistry())

/**
 * Registry untuk request yang sedang berjalan.
 *
 * Di dalam render React (route, server component, server action), `cache`
 * menyimpan satu instance per request sehingga pendaftaran dan pemakaian hook
 * berada di registry yang sama, tanpa state global yang bocor antar-pengguna.
 *
 * Di luar React — tes unit, skrip, pekerjaan latar — `cache` tidak menyimpan
 * apa pun, jadi setiap panggilan menghasilkan registry baru. Untuk pemakaian
 * seperti itu, pegang satu instance dari `createHookRegistry()` dan pakai
 * metodenya, bukan fungsi bebas di bawah.
 */
export function getHookRegistry(): HookRegistry {
  return requestRegistry()
}

/** Registry lepas; pemanggil yang memegang umurnya. Lihat `getHookRegistry`. */
export function createHookRegistry(): HookRegistry {
  return new HookRegistry()
}

export function addFilter(
  hook: FilterHookName,
  callback: HookCallback,
  priority?: number,
): void {
  getHookRegistry().addFilter(hook, callback, priority)
}

export function removeFilter(
  hook: FilterHookName,
  callback: HookCallback,
  priority?: number,
): boolean {
  return getHookRegistry().removeFilter(hook, callback, priority)
}

export function hasFilter(hook: FilterHookName): boolean {
  return getHookRegistry().hasFilter(hook)
}

export function addAction(
  hook: ActionHookName,
  callback: HookCallback,
  priority?: number,
): void {
  getHookRegistry().addAction(hook, callback, priority)
}

export function removeAction(
  hook: ActionHookName,
  callback: HookCallback,
  priority?: number,
): boolean {
  return getHookRegistry().removeAction(hook, callback, priority)
}

export function hasAction(hook: ActionHookName): boolean {
  return getHookRegistry().hasAction(hook)
}

export function didAction(hook: ActionHookName): number {
  return getHookRegistry().didAction(hook)
}

/** Filter berantai pada registry request. Lihat `HookRegistry.applyFilters`. */
export function applyFilters<K extends FilterHookName>(
  hook: K,
  value: FilterValues[K],
  ...args: unknown[]
): Promise<FilterValues[K]> {
  return getHookRegistry().applyFilters(hook, value, ...args)
}

/** Menjalankan action pada registry request. Lihat `HookRegistry.doAction`. */
export function doAction<K extends ActionHookName>(
  hook: K,
  payload: ActionValues[K],
): Promise<number> {
  return getHookRegistry().doAction(hook, payload)
}
