import type { ExtensionModule } from '@/lib/extensions/kernel'

/**
 * Indeks statis ekstensi bawaan — padanan `mu-plugins` WordPress.
 *
 * Ekstensi di folder ini adalah kode yang ikut ter-build bersama aplikasi (bukan
 * paket unggahan; paket unggahan tidak dieksekusi sebagai modul host Next.js).
 * Karena itu daftarnya statis: Next.js perlu
 * mengetahui modulnya saat build, dan berkas ini satu-satunya tempat
 * pendaftarannya.
 *
 * Daftar ini **sengaja kosong**. Selama kosong, kernel tidak memakai satu pun
 * query database dan output halaman publik harus tetap identik dengan sebelum
 * ekstensi ada.
 *
 * Menambah ekstensi bawaan:
 *
 * 1. Buat berkas di folder ini yang mengekspor `ExtensionModule`, mengikuti
 *    bentuk `ExtensionModule` di `lib/extensions/kernel.ts`.
 * 2. Impor dan masukkan ke array di bawah.
 * 3. Uji keluaran halaman: filter konten **wajib** menghasilkan HTML yang lolos
 *    `lib/content/sanitize.ts`, dan tidak semua markup bertahan (atribut di luar
 *    allowlist dibuang tanpa galat).
 */
export const builtinExtensions: ExtensionModule[] = []
