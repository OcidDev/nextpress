'use client'

import { useState } from 'react'
import { exportWxrAction } from '@/server/actions/tools'

export function ExportView() {
  const [contentType, setContentType] = useState<'all' | 'posts' | 'pages'>('all')
  const [postStatus, setPostStatus] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const res = await exportWxrAction({
        type: contentType,
        status: contentType === 'posts' ? postStatus : 'all',
      })

      if (res.error || !res.xml) {
        setError(res.error || 'Gagal mengekspor data.')
        return
      }

      // Trigger file download in browser
      const blob = new Blob([res.xml], { type: 'application/xml;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename || 'export.xml'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Terjadi kegagalan saat mengunduh berkas ekspor.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="adminSettingsStack">
      <div className="adminSettingsSection">
        <h2>Ekspor Konten Situs</h2>
        <p>
          Bila Anda mengeklik tombol di bawah ini, sistem akan membuat berkas XML untuk disimpan di
          komputer Anda. Format WordPress eXtended RSS (WXR 1.2) memuat pos, laman, kategori, dan
          tag. Komentar, berkas media, dan pengaturan situs tidak disertakan. Gunakan backup
          database untuk pemulihan instalasi lengkap.
        </p>

        <fieldset
          style={{
            border: 'none',
            padding: 0,
            margin: '1.5rem 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <legend style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
            Pilih apa yang ingin diekspor:
          </legend>

          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          >
            <input
              type="radio"
              name="contentType"
              value="all"
              checked={contentType === 'all'}
              onChange={() => setContentType('all')}
            />
            <strong>Semua konten</strong> (pos dan laman)
          </label>

          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          >
            <input
              type="radio"
              name="contentType"
              value="posts"
              checked={contentType === 'posts'}
              onChange={() => setContentType('posts')}
            />
            <strong>Pos artikel saja</strong>
          </label>

          {contentType === 'posts' && (
            <div
              style={{
                marginLeft: '1.75rem',
                marginTop: '0.5rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <label>
                Status:
                <select
                  value={postStatus}
                  onChange={(e) => setPostStatus(e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  <option value="all">Semua Status</option>
                  <option value="published">Diterbitkan</option>
                  <option value="draft">Draf</option>
                </select>
              </label>
            </div>
          )}

          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          >
            <input
              type="radio"
              name="contentType"
              value="pages"
              checked={contentType === 'pages'}
              onChange={() => setContentType('pages')}
            />
            <strong>Laman saja</strong>
          </label>
        </fieldset>

        {error && (
          <p role="alert" style={{ color: '#ef4444', fontWeight: 500, marginBottom: '1rem' }}>
            {error}
          </p>
        )}

        <button type="button" className="button" onClick={handleExport} disabled={loading}>
          {loading ? 'Membuat Berkas Ekspor…' : 'Unduh Berkas Ekspor'}
        </button>
      </div>
    </div>
  )
}
