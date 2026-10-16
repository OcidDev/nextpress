import Link from 'next/link'
import styles from './PostList.module.css'

/**
 * Membangun fungsi tautan halaman dari basis path dan query yang aktif.
 *
 * Dipakai `PostList` (halaman arsip) dan blok `core/pagination` sekaligus, supaya
 * bentuk URL paginasi hanya ditulis di satu tempat.
 */
export function paginationHref({ basePath = '/', query }: { basePath?: string; query?: string }) {
  return (page: number) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    params.set('page', String(page))
    return `${basePath}?${params}`
  }
}

/**
 * Navigasi halaman daftar artikel.
 *
 * Dipisah dari `PostList` supaya markup paginasi dapat dipakai ulang oleh blok
 * tema `core/pagination` (sprint EXT-03) tanpa menyalinnya: halaman dan blok
 * merender komponen yang sama, jadi tidak ada dua sumber kebenaran. `href`
 * diserahkan pemanggil karena hanya dia yang tahu basis path dan query aktif.
 */
export function PostPagination({
  page,
  totalPages,
  href,
  variant = 'pages',
}: {
  page: number
  totalPages: number
  href: (page: number) => string
  /**
   * `pages` — navigasi sebelumnya/berikutnya dengan penunjuk halaman.
   * `back` — satu tautan kembali, dipakai saat daftar kosong sehingga tidak ada
   * halaman tujuan yang lebih masuk akal daripada halaman terakhir.
   */
  variant?: 'pages' | 'back'
}) {
  if (variant === 'back') {
    if (page <= 1) return null
    const target = Math.max(1, totalPages)
    return (
      <nav className={styles.pagination} aria-label="Pagination">
        <Link href={href(target)}>← Kembali ke halaman {target}</Link>
      </nav>
    )
  }
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)}>← Sebelumnya</Link>}
      <span>
        Halaman {page} dari {totalPages}
      </span>
      {page < totalPages && <Link href={href(page + 1)}>Berikutnya →</Link>}
    </nav>
  )
}
