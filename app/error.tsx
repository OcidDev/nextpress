'use client'
// client — required by Next.js error boundary API.
import Link from 'next/link'

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main id="main-content" className="panel emptyState" tabIndex={-1}>
      <h1>Halaman belum bisa dimuat</h1>
      <p>Silakan coba kembali beberapa saat lagi.</p>
      <button type="button" className="button" onClick={reset}>
        Coba lagi
      </button>
      <Link href="/">Kembali ke beranda</Link>
    </main>
  )
}
