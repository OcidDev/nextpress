import type { ExtensionModule } from '@/lib/extensions/kernel'

/**
 * Contoh ekstensi bawaan. **Tidak didaftarkan** di `index.ts` — berkas ini ada
 * supaya bentuk `ExtensionModule` yang benar bisa dibaca (dan tetap diperiksa
 * TypeScript saat build) tanpa mengubah output situs.
 *
 * Yang perlu diperhatikan bila meniru contoh ini:
 *
 * - **Prioritas** menentukan urutan filter; bawaan `10`, angka kecil lebih dulu.
 *   Di sini `20` dipakai supaya hasil transformasi ini berjalan setelah filter
 *   prioritas bawaan.
 * - **Filter wajib mengembalikan nilai** bertipe sama. Lupa `return` bukan
 *   "tidak mengubah apa pun" di WordPress — di sini nilai lamanya dipertahankan
 *   dan sebuah peringatan dicatat, tetapi tetap jangan diandalkan.
 * - **Sanitasi berjalan setelah filter.** Markup yang dihasilkan tetap melewati
 *   `lib/content/sanitize.ts`, jadi hanya tag dan atribut yang ada di allowlist
 *   yang bertahan: `<p>` dan teks aman, tetapi `class` pada `<p class="...">`
 *   akan dibuang. Ekstensi yang benar-benar butuh markup baru harus menambah
 *   allowlist sanitizer secara sadar, bukan menghindarinya.
 * - **Jangan mengimpor `server-only`** dari ekstensi yang ingin diuji langsung di
 *   Node; akses database sebaiknya lewat fungsi query yang sudah ada.
 */

/** Asumsi kecepatan baca; angka kasar, sama seperti plugin sejenis di WordPress. */
const wordsPerMinute = 200

function readingTimeLabel(html: string): string {
  const words = html
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return `Perkiraan waktu baca: ${Math.max(1, Math.round(words / wordsPerMinute))} menit`
}

export const readingTimeExample: ExtensionModule = {
  id: 'example-reading-time',
  version: '0.1.0',
  setup({ registry, id }) {
    registry.addFilter(
      'the_content',
      (html: string) => `${html}\n<p>${readingTimeLabel(html)}</p>`,
      20,
    )
    registry.addAction('post_published', ({ slug }: { slug: string }) => {
      console.info(`[${id}] artikel terbit: ${slug}`)
    })
  },
}
