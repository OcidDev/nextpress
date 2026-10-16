'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { MediaUpload } from './MediaUpload'
import { ImageDisplayFields } from './ImageDisplayFields'
import { validImageLink, type ImageDisplay } from '@/lib/content/image-settings'

export type EditorMedia = {
  id: string
  name: string
  alt: string
  title?: string
  caption?: string
  description?: string
  width: number
  height: number
  size: number
}
type MediaResult = { items: EditorMedia[]; page: number; hasNext: boolean }

export function MediaPicker({
  onSelect,
  label = 'Pilih dari media',
  displaySettings = false,
  title,
  confirmLabel,
  onOpen,
}: {
  onSelect: (media: EditorMedia, display?: ImageDisplay) => void
  label?: string
  displaySettings?: boolean
  title?: string
  confirmLabel?: string
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onOpen?.()
          setOpen(true)
        }}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <MediaDialog
            displaySettings={displaySettings}
            title={title || (displaySettings ? 'Sisipkan media' : 'Pustaka media')}
            confirmLabel={
              confirmLabel || (displaySettings ? 'Sisipkan ke konten' : 'Gunakan gambar')
            }
            onClose={() => setOpen(false)}
            onSelect={(media, display) => {
              onSelect(media, display)
              setOpen(false)
            }}
          />,
          document.body,
        )}
    </>
  )
}

function MediaDialog({
  displaySettings,
  title,
  confirmLabel,
  onClose,
  onSelect,
}: {
  displaySettings: boolean
  title: string
  confirmLabel: string
  onClose: () => void
  onSelect: (media: EditorMedia, display?: ImageDisplay) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<MediaResult | null>(null)
  const [selected, setSelected] = useState<EditorMedia | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [tab, setTab] = useState<'library' | 'upload'>('library')
  const [display, setDisplay] = useState<ImageDisplay | undefined>()
  function choose(item: EditorMedia) {
    setSelected(item)
    setDisplay({
      align: 'none',
      width: item.width,
      height: item.height,
      alt: item.alt,
      caption: item.caption || '',
      href: '',
      newTab: false,
    })
  }
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setPending(true)
    setError('')
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/admin/media?q=${encodeURIComponent(search)}&page=${page}`,
          { signal: controller.signal, cache: 'no-store' },
        )
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
          throw new Error('Media tidak dapat dimuat. Periksa koneksi atau masuk kembali.')
        const data = (await response.json()) as MediaResult
        setResult(data)
      } catch (problem) {
        if (!controller.signal.aborted)
          setError(problem instanceof Error ? problem.message : 'Media tidak dapat dimuat.')
      } finally {
        if (!controller.signal.aborted) setPending(false)
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [search, page, refresh])
  return (
    <dialog
      ref={dialog}
      className="mediaPicker adminRoot"
      aria-labelledby="media-picker-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="mediaPickerBody">
        <header className="mediaPickerHeader">
          <div>
            <h2 id="media-picker-title">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup pemilih media">
            ×
          </button>
        </header>
        <div className="mediaTabs" role="tablist" aria-label="Sisipkan media">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            onClick={() => setTab('upload')}
          >
            Unggah berkas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'library'}
            onClick={() => setTab('library')}
          >
            Pustaka media
          </button>
        </div>
        {tab === 'upload' ? (
          <MediaUpload
            onUploaded={(item) => {
              choose(item)
              setSearch('')
              setPage(1)
              setRefresh((value) => value + 1)
              setTab('library')
            }}
          />
        ) : (
          <>
            <div className="adminForm mediaPickerSearch">
              <label>
                Cari media
                <input
                  type="search"
                  value={search}
                  maxLength={120}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                    setSelected(null)
                  }}
                  autoFocus
                />
              </label>
              <button
                type="button"
                onClick={() => setRefresh((value) => value + 1)}
                disabled={pending}
              >
                Muat ulang
              </button>
            </div>

            {error && <p role="alert">{error}</p>}
            <div className="mediaPickerWorkspace">
              <div className="mediaPickerResults">
                {pending ? (
                  <p role="status">Memuat media…</p>
                ) : (
                  <div className="mediaPickerGrid">
                    {result?.items.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        aria-pressed={selected?.id === item.id}
                        className="mediaPickerItem"
                        onClick={() => choose(item)}
                      >
                        <Image
                          src={`/api/media/${item.id}`}
                          alt={item.alt || item.name}
                          width={180}
                          height={120}
                          unoptimized
                        />
                        <span>{item.name}</span>
                        <small>
                          {item.width} × {item.height}
                        </small>
                      </button>
                    ))}
                    {result?.items.length === 0 && <p>Tidak ada media yang ditemukan.</p>}
                  </div>
                )}
              </div>
              <aside className="mediaPickerDetails">
                {selected ? (
                  <>
                    <h3>Detail lampiran</h3>
                    <Image
                      className="mediaPickerPreview"
                      src={`/api/media/${selected.id}`}
                      alt={selected.alt}
                      width={240}
                      height={160}
                      unoptimized
                    />
                    <strong>{selected.title || selected.name}</strong>
                    <p>
                      {selected.width} × {selected.height} piksel ·{' '}
                      {Math.ceil(selected.size / 1024)} KB
                    </p>
                    {displaySettings && display ? (
                      <>
                        <ImageDisplayFields
                          key={selected.id}
                          value={display}
                          onChange={setDisplay}
                          original={selected}
                          src={`/api/media/${selected.id}`}
                        />
                      </>
                    ) : (
                      <p>{selected.alt || 'Belum ada teks alternatif.'}</p>
                    )}
                  </>
                ) : (
                  <p>Pilih gambar untuk melihat detailnya.</p>
                )}
              </aside>
            </div>
          </>
        )}
        {selected && (
          <span className="srOnly" role="status">
            Gambar terpilih: {selected.name}
          </span>
        )}
        <footer className="mediaPickerFooter">
          <div className="adminActions">
            {selected && <span className="mediaSelectionCount">1 gambar dipilih</span>}
            <button
              type="button"
              disabled={pending || page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <span>Halaman {page}</span>
            <button
              type="button"
              disabled={pending || !result?.hasNext}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
            </button>
          </div>
          <button
            type="button"
            className="button"
            disabled={!selected || pending || tab !== 'library'}
            onClick={() => {
              if (!selected) return
              if (displaySettings && !validImageLink(display?.href?.trim() || '')) {
                setError('Gunakan URL http(s) atau tautan halaman situs.')
                return
              }
              dialog.current?.close()
              onSelect(
                selected,
                displaySettings && display
                  ? { ...display, href: display.href?.trim() || '' }
                  : undefined,
              )
            }}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
