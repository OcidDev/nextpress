import { createRoleRegistry } from '@/lib/core/roles'

/**
 * Kapabilitas CMS (sprint EXT-02) — padanan `capabilities` WordPress.
 *
 * Sebelum ini setiap aksi istimewa memeriksa peran secara langsung
 * (`role === 'admin'`). Dengan adanya hook dan ekstensi, pertanyaan yang benar
 * bukan lagi "apakah dia admin?" melainkan "apakah dia boleh melakukan hal ini?".
 * Pemisahan itu membuat pemetaan peran → izin berada di satu tempat dan dapat
 * diuji, dan itulah yang akan dipakai tema/plugin (EXT-07 ke atas) alih-alih
 * menyalin pemeriksaan peran.
 *
 * Berkas ini **murni** (tanpa `server-only`, tanpa `next/headers`) supaya
 * pemetaannya dapat diuji langsung. Penjaga sisi server yang memakai sesi ada di
 * `lib/admin.ts` (`requireCapability`).
 */

/** Kapabilitas yang dikenal, mengikuti nama di WordPress. */
export const capabilities = [
  'install_plugins',
  'activate_plugins',
  'delete_plugins',
  'install_themes',
  'switch_themes',
  'edit_theme_options',
] as const

export type Capability = (typeof capabilities)[number]

/**
 * Pemetaan peran → kapabilitas.
 *
 * `administrator` (alias legacy `admin`) memiliki kapabilitas ini; penulis tidak memiliki satu pun,
 * sesuai perilaku WordPress untuk peran Author. Peran yang tidak dikenal tidak
 * mendapat apa pun.
 */
const roles = createRoleRegistry()

export function capabilitiesFor(role: string): readonly Capability[] {
  return capabilities.filter((capability) => roles.has(role, capability))
}

export function hasCapability(role: string, capability: Capability): boolean {
  return capabilitiesFor(role).includes(capability)
}

/**
 * Kapabilitas yang **belum punya titik panggil**, beserta alasannya.
 *
 * Sama seperti `deferredHooks` di `hook-types.ts`: nama ini sah dan sudah
 * dipetakan ke peran admin, tetapi belum ada satu pun aksi yang menjaganya karena
 * fiturnya memang belum ada. Daftarnya eksplisit agar tidak ada yang mengira
 * kapabilitas sudah berlaku. Kapabilitas yang tidak tercantum di sini harus
 * benar-benar dipakai di kode aplikasi.
 */
// Instalasi dan aktivasi tema kini dijaga oleh action paket tema.
export const deferredCapabilities: Partial<Record<Capability, string>> = {}
