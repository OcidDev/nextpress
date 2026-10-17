'use client'

import { MAX_THEME_ZIP_BYTES, THEME_ZIP_SIZE_MESSAGE } from '@/lib/themes/limits'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { InstalledTheme } from '@/lib/themes/manager'
import { uploadThemeAction, activateThemeAction, deleteThemeAction } from '@/server/actions/themes'

export function ThemeGallery({ themes }: { themes: InstalledTheme[] }) {
  const router = useRouter()
  const [showUpload, setShowUpload] = useState(false)
  const [uploadPending, setUploadPending] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [isActivating, startActivation] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUploadError(null)
    setUploadMessage(null)
    setUploadPending(true)

    const form = event.currentTarget
    const formData = new FormData(form)

    try {
      const file = formData.get('file')
      if (file instanceof File && file.size > MAX_THEME_ZIP_BYTES)
        throw new Error(THEME_ZIP_SIZE_MESSAGE)
      const res = await uploadThemeAction(null, formData)
      if (res.error) {
        setUploadError(res.error)
      } else {
        setUploadMessage(res.message || 'Tema berhasil dipasang!')
        form.reset()
        setShowUpload(false)
        router.refresh()
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal mengunggah tema.')
    } finally {
      setUploadPending(false)
    }
  }

  function handleActivate(themeId: string) {
    setActionError(null)
    startActivation(async () => {
      const res = await activateThemeAction(themeId)
      if (res.error) {
        setActionError(res.error)
      } else {
        router.refresh()
      }
    })
  }

  async function handleDelete(theme: InstalledTheme) {
    const confirmed = window.confirm(
      `Hapus tema "${theme.name}" secara permanen? Paket tema akan dihapus dari instalasi ini. Halaman, menu, dan pengaturan inti situs tidak diubah.`,
    )
    if (!confirmed) return
    setActionError(null)
    setDeletingId(theme.id)
    try {
      const res = await deleteThemeAction(theme.id, theme.hash)
      if (res.error) setActionError(res.error)
      else router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 700 }}>Tema Terpasang</h2>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
            Kelola dan pilih tema tampilan situs Anda, atau unggah tema baru dalam format berkas ZIP.
          </p>
        </div>
        <div className="adminActions" style={{ margin: 0 }}>
          <button type="button" className="button" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? 'Tutup Unggahan' : '+ Unggah Tema Baru'}
          </button>
        </div>
      </div>

      {uploadMessage && (
        <div
          role="status"
          style={{
            padding: '0.75rem 1rem',
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          {uploadMessage}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          {actionError}
        </div>
      )}

      {showUpload && (
        <div
          style={{
            border: '2px dashed #3b82f6',
            background: '#eff6ff',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          <h3 style={{ marginTop: 0, color: '#1e40af' }}>Unggah Tema dalam Format .ZIP</h3>
          <p style={{ fontSize: '0.875rem', color: '#1e3a8a', marginBottom: '1rem' }}>
            Jika Anda memiliki tema dalam format berkas .zip, Anda dapat memasangnya dengan
            mengunggahnya di sini (maksimal 4 MB).
          </p>
          <form
            onSubmit={handleUpload}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px' }}
          >
            <input type="file" name="file" accept=".zip" required disabled={uploadPending} />
            {uploadError && (
              <p role="alert" style={{ color: '#ef4444', fontSize: '0.875rem', margin: 0 }}>
                {uploadError}
              </p>
            )}
            <button
              type="submit"
              className="button"
              disabled={uploadPending}
              style={{ alignSelf: 'flex-start' }}
            >
              {uploadPending ? 'Memasang Tema…' : 'Pasang Sekarang'}
            </button>
          </form>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gap: '1.5rem',
        }}
      >
        {themes.map((theme) => (
          <div
            key={theme.id}
            style={{
              border: theme.isActive ? '2px solid #2563eb' : '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#ffffff',
              boxShadow: theme.isActive
                ? '0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -2px rgba(37, 99, 235, 0.1)'
                : '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            {theme.isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  zIndex: 2,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                }}
              >
                AKTIF
              </div>
            )}

            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '200px',
                backgroundColor: '#f3f4f6',
              }}
            >
              <Image
                src={theme.screenshotUrl}
                alt={`Screenshot tema ${theme.name}`}
                fill
                style={{ objectFit: 'cover' }}
                unoptimized
              />
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  marginBottom: '0.25rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>{theme.name}</h3>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>v{theme.version}</span>
              </div>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>
                Oleh {theme.author}
              </p>
              <p
                style={{
                  margin: '0 0 1.25rem',
                  fontSize: '0.875rem',
                  color: '#4b5563',
                  lineHeight: 1.4,
                  flex: 1,
                }}
              >
                {theme.description}
              </p>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginTop: 'auto',
                  paddingTop: '1rem',
                  borderTop: '1px solid #f3f4f6',
                }}
              >
                {theme.broken && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#b91c1c',
                      alignSelf: 'center',
                    }}
                  >
                    PAKET BERMASALAH
                  </span>
                )}

                {theme.supportsCustomizer && !theme.broken && (
                  <Link
                    href={`/admin/site-editor?theme=${theme.id}`}
                    className="button"
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      backgroundColor: theme.isActive ? '#2563eb' : '#4b5563',
                      color: '#ffffff',
                    }}
                  >
                    Sesuaikan
                  </Link>
                )}

                {!theme.broken && (
                  <Link
                    href={`/preview/theme/${theme.id}`}
                    className="button"
                    style={{ background: '#f3f4f6', color: '#1f2937' }}
                  >
                    Pratinjau
                  </Link>
                )}
                {!theme.isActive && !theme.broken && (
                  <button
                    type="button"
                    className="button"
                    style={{
                      flex: 1,
                      backgroundColor: '#f3f4f6',
                      color: '#1f2937',
                      border: '1px solid #d1d5db',
                    }}
                    onClick={() => handleActivate(theme.id)}
                    disabled={isActivating}
                  >
                    {isActivating ? 'Mengaktifkan…' : 'Aktifkan'}
                  </button>
                )}
                {!theme.isActive && !theme.isDefault && (
                  <button
                    type="button"
                    className="button"
                    style={{
                      backgroundColor: '#fef2f2',
                      color: '#b91c1c',
                      border: '1px solid #fecaca',
                    }}
                    onClick={() => handleDelete(theme)}
                    disabled={deletingId === theme.id}
                    title="Hapus paket tema"
                  >
                    {deletingId === theme.id ? 'Menghapus…' : 'Hapus'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
