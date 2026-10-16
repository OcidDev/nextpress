'use client'

import { useActionState } from 'react'
import { formatDate } from '@/lib/utils'
import { resumeExtension } from '@/server/actions/extensions'

/** Satu ekstensi yang dijeda kernel karena gagal berulang kali. */
export type PausedExtension = {
  id: string
  lastError: string
  pausedAt: string | null
  /** `false` = id tercatat di penyimpanan kesehatan tetapi tidak ada di build ini. */
  present: boolean
}

/**
 * Pemberitahuan mode pemulihan di dasbor (sprint EXT-02).
 *
 * Ditempatkan di halaman, bukan di dalam shell, supaya hanya muncul pada dasbor —
 * tempat admin melihat keadaan situs — dan tidak mengganggu halaman kerja lain.
 * Gaya merah datang dari `app/admin/admin.css` (`[role='alert']`).
 *
 * Catatan: catatan lama untuk ekstensi yang sudah tidak ada di build tetap
 * ditampilkan (dengan penanda) supaya tetap dapat dibersihkan; kalau tidak, admin
 * tidak punya cara menghapusnya.
 */
export function ExtensionsNotice({ paused }: { paused: PausedExtension[] }) {
  const [state, action, pending] = useActionState(resumeExtension, {})
  if (!paused.length) return null
  return (
    <section role="alert">
      <p>
        <strong>Mode pemulihan.</strong> {paused.length} ekstensi dijeda setelah gagal berulang
        kali saat dimuat. Situs tetap dirender tanpa ekstensi itu; perbaiki penyebabnya lalu coba
        lagi.
      </p>
      <ul>
        {paused.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.id}</strong>
            {entry.present ? '' : ' (tidak ada di build ini)'}
            {entry.pausedAt && ` — dijeda ${formatDate(entry.pausedAt)}`}
            {entry.lastError && `: ${entry.lastError}`}
            <form action={action}>
              <input type="hidden" name="id" value={entry.id} />
              <button disabled={pending}>Coba lagi</button>
            </form>
          </li>
        ))}
      </ul>
      {state.error && <p>{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </section>
  )
}
