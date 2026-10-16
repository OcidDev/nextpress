'use client'

import Link from 'next/link'

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="adminSettingsSection" aria-labelledby="admin-error-title">
      <h1 id="admin-error-title">Halaman admin belum bisa dimuat</h1>
      <p>
        Coba muat ulang. Jika masih gagal, periksa koneksi database dan status migrasi aplikasi.
      </p>
      <div className="adminActions">
        <button className="button" onClick={reset}>
          Coba lagi
        </button>
        <Link href="/admin" className="button secondary">
          Kembali ke dasbor
        </Link>
      </div>
    </section>
  )
}
