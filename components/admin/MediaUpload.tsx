'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { uploadEditorMedia } from '@/server/actions/operations'
import type { EditorMedia } from './MediaPicker'
import { MEDIA_UPLOAD_MAX_BYTES, MEDIA_UPLOAD_MAX_MB } from '@/lib/media-limits'
const accepted = 'image/jpeg,image/png,image/webp,image/gif,image/avif'
type UploadItem = { file: File; status: 'ready' | 'uploading' | 'done' | 'error'; error?: string }
export function MediaUpload({
  onUploaded,
  multiple = false,
}: {
  onUploaded: (media: EditorMedia) => void
  multiple?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [alt, setAlt] = useState('')
  const [preview, setPreview] = useState('')
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const file = items.length === 1 ? items[0]!.file : null
  useEffect(() => {
    if (!file) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  function select(files: FileList | null) {
    if (busy.current || !files?.length) return
    setError('')
    const selected = [...files]
    if (
      selected.length > (multiple ? 20 : 1) ||
      selected.some(
        (candidate) =>
          !candidate.size ||
          candidate.size > MEDIA_UPLOAD_MAX_BYTES ||
          !accepted.split(',').includes(candidate.type),
      )
    ) {
      setError(
        `Pilih ${multiple ? 'maksimal 20' : 'satu'} gambar JPEG, PNG, WebP, GIF, atau AVIF, maksimal ${MEDIA_UPLOAD_MAX_MB} MB per berkas.`,
      )
      if (input.current) input.current.value = ''
      return
    }
    setItems(selected.map((file) => ({ file, status: 'ready' })))
  }
  async function upload() {
    if (busy.current || !items.some((item) => item.status !== 'done')) return
    busy.current = true
    setPending(true)
    setError('')
    const queue = [...items]
    try {
      for (let i = 0; i < queue.length; i++) {
        if (queue[i]!.status === 'done') continue
        queue[i] = { ...queue[i]!, status: 'uploading', error: undefined }
        setItems([...queue])
        const data = new FormData()
        data.set('file', queue[i]!.file)
        data.set('alt', alt)
        try {
          const result = await uploadEditorMedia(data)
          if (!result.media) throw new Error(result.error || 'Gagal mengunggah gambar.')
          queue[i] = { ...queue[i]!, status: 'done' }
          onUploaded(result.media)
        } catch (problem) {
          queue[i] = {
            ...queue[i]!,
            status: 'error',
            error: problem instanceof Error ? problem.message : 'Koneksi terputus. Coba lagi.',
          }
        }
        setItems([...queue])
      }
      if (input.current) input.current.value = ''
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  const unfinished = items.some((item) => item.status !== 'done')
  return (
    <div className="adminForm mediaUpload" aria-busy={pending}>
      <div
        className={`mediaDropzone${dragging ? ' isDragging' : ''}`}
        data-testid="media-dropzone"
        onDragOver={(e) => {
          e.preventDefault()
          if (!pending) setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          select(e.dataTransfer.files)
        }}
      >
        <p className="mediaDropInstruction">Tarik gambar ke sini untuk mengunggah</p>
        <span className="mediaDropDivider">atau</span>
        <button
          className="button secondary mediaSelectButton"
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          Pilih berkas
        </button>
        <label className="srOnly">
          Gambar
          <input
            ref={input}
            name="file"
            type="file"
            accept={accepted}
            multiple={multiple}
            disabled={pending}
            className="srOnly"
            onClick={(e) => {
              e.currentTarget.value = ''
            }}
            onChange={(e) => select(e.target.files)}
          />
        </label>
        <small>
          Ukuran berkas maksimal {MEDIA_UPLOAD_MAX_MB} MB. Gambar disimpan sebagai WebP.
        </small>
      </div>
      {!!items.length && (
        <div className="mediaUploadQueue">
          {preview && (
            <Image unoptimized width={90} height={70} src={preview} alt="Pratinjau unggahan" />
          )}
          <ul>
            {items.map((item, index) => (
              <li key={index}>
                <span>{item.file.name}</span>
                <small>
                  {
                    {
                      ready: 'Siap diunggah',
                      uploading: 'Mengunggah…',
                      done: 'Selesai',
                      error: 'Gagal',
                    }[item.status]
                  }
                </small>
                {item.error && <p role="alert">{item.error}</p>}
              </li>
            ))}
          </ul>
          {!pending && (
            <button
              type="button"
              onClick={() => {
                setItems([])
                if (input.current) input.current.value = ''
              }}
            >
              Hapus pilihan
            </button>
          )}
        </div>
      )}
      <label>
        Teks alternatif
        <input
          name="alt"
          maxLength={250}
          value={alt}
          disabled={pending}
          onChange={(e) => setAlt(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {pending && (
        <p role="status">
          Mengunggah gambar… {items.filter((item) => item.status === 'done').length}/{items.length}
        </p>
      )}
      {!pending && items.length > 0 && !unfinished && (
        <p role="status">{items.length} gambar berhasil diunggah.</p>
      )}
      <button type="button" className="button" disabled={pending || !unfinished} onClick={upload}>
        {pending ? 'Mengunggah…' : 'Unggah gambar'}
      </button>
    </div>
  )
}
