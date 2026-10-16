import { cleanHtml } from '@/lib/content/sanitize'
import { getHookRegistry, type HookRegistry } from './hooks'

/**
 * Jalur `the_content` (EXT-01): filter ekstensi lebih dulu, sanitasi **sesudahnya**.
 *
 * Urutan ini wajib. Filter berjalan atas HTML yang sudah lewat `buildArticleContent`
 * (termasuk penyisipan id judul), lalu hasil akhirnya tetap melewati `cleanHtml`.
 * Konsekuensinya: keluaran ekstensi tidak pernah lolos ke halaman hanya karena ia
 * berasal dari dalam aplikasi — daftar tag/atribut di `lib/content/sanitize.ts`
 * tetap penentu terakhir.
 *
 * Batas yang perlu diketahui penulis ekstensi: `cleanHtml` hanya mengizinkan tag
 * dan atribut pada daftar putihnya. Atribut di luar daftar dibuang tanpa galat —
 * `<span class="reading-time">` kehilangan `class`-nya — dan tag di luar daftar
 * dibuang seluruhnya (untuk tag seperti `<script>`, isinya ikut hilang). Jadi
 * markup tambahan dari filter hanya bertahan bila tag **dan** atributnya sudah ada
 * di daftar putih; ekstensi yang butuh keduanya harus memperluas daftar itu
 * secara sadar, bukan mengakalinya dari sisi filter.
 */
export async function filteredContentHtml(html: string): Promise<string> {
  return contentHtmlWithRegistry(getHookRegistry(), html)
}

/**
 * Sama dengan `filteredContentHtml`, tetapi atas registry yang diberikan
 * pemanggil. Dipakai tes dan kalangan yang memegang registry sendiri (pekerjaan
 * latar, kernel ekstensi), karena di luar render React `getHookRegistry()`
 * menghasilkan instance baru setiap panggilan.
 */
export async function contentHtmlWithRegistry(
  registry: HookRegistry,
  html: string,
): Promise<string> {
  return cleanHtml(await registry.applyFilters('the_content', html))
}
