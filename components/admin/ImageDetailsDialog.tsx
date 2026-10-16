'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import { ImageDisplayFields } from './ImageDisplayFields'
import { MediaPicker } from './MediaPicker'
import { validImageLink, type ImageDisplay } from '@/lib/content/image-settings'

export type ImageDetails = ImageDisplay & { src: string; title?: string }
export function ImageDetailsDialog({
  initial,
  original,
  canUpload,
  onClose,
  onApply,
}: {
  initial: ImageDetails
  original: { width: number; height: number }
  canUpload: boolean
  onClose: () => void
  onApply: (value: ImageDetails) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(initial)
  const [dimensions, setDimensions] = useState(original)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="mediaPicker imageDetailsDialog adminRoot"
      aria-labelledby="image-details-heading"
      onCancel={onClose}
    >
      <header className="mediaPickerHeader">
        <h2 id="image-details-heading">Detail gambar</h2>
        <button type="button" aria-label="Tutup detail gambar" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="imageDetailsWorkspace">
        <section className="imageDetailsSettings" aria-label="Pengaturan gambar">
          <ImageDisplayFields
            key={draft.src}
            value={draft}
            onChange={(value) => setDraft({ ...draft, ...value })}
            original={dimensions}
            src={draft.src}
          />
          {error && <p role="alert">{error}</p>}
        </section>
        <section className="imageDetailsPreview" aria-label="Pratinjau gambar">
          <figure>
            <img src={draft.src} alt={draft.alt} style={{ width: draft.width }} />
            {draft.caption && <figcaption>{draft.caption}</figcaption>}
          </figure>
          {canUpload && (
            <MediaPicker
              label="Ganti gambar"
              title="Ganti gambar"
              confirmLabel="Ganti gambar"
              onSelect={(media) => {
                const src = `/api/media/${media.id}`
                setDimensions({ width: media.width, height: media.height })
                setDraft({
                  ...draft,
                  src,
                  width: media.width,
                  height: media.height,
                  alt: media.alt,
                  title: '',
                  href: draft.href === draft.src ? src : draft.href,
                })
              }}
            />
          )}
          <small>
            {dimensions.width} × {dimensions.height} piksel
          </small>
        </section>
      </div>
      <footer className="mediaPickerFooter">
        <button type="button" onClick={onClose}>
          Batal
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            const href = draft.href?.trim() || ''
            if (!validImageLink(href)) {
              setError('Gunakan URL http(s) atau tautan halaman situs.')
              return
            }
            onApply({ ...draft, href })
          }}
        >
          Perbarui
        </button>
      </footer>
    </dialog>
  )
}
