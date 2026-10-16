'use client'
import { useActionState } from 'react'
import { updateMedia } from '@/server/actions/operations'
import { useRouter } from 'next/navigation'
import { MediaUpload } from './MediaUpload'
import type { EditorMedia } from './MediaPicker'
export function UploadForm() {
  const router = useRouter()
  return <MediaUpload multiple onUploaded={() => router.refresh()} />
}
export function MediaMetadataForm({ item, onSaved }: { item: EditorMedia; onSaved?: () => void }) {
  const [state, action, pending] = useActionState(
    async (previous: { error?: string; success?: string }, data: FormData) => {
      const result = await updateMedia(previous, data)
      if (result.success) onSaved?.()
      return result
    },
    {},
  )
  return (
    <form action={action} className="adminForm mediaMetadataForm">
      <input type="hidden" name="id" value={item.id} />
      <label>
        Teks alternatif
        <input name="alt" defaultValue={item.alt} maxLength={250} />
      </label>
      <small>Jelaskan isi gambar. Kosongkan jika gambar hanya dekorasi.</small>
      <label>
        Judul
        <input name="title" defaultValue={item.title || item.name} maxLength={250} />
      </label>
      <label>
        Keterangan
        <textarea name="caption" defaultValue={item.caption || ''} maxLength={2000} rows={2} />
      </label>
      <label>
        Deskripsi
        <textarea
          name="description"
          defaultValue={item.description || ''}
          maxLength={10000}
          rows={3}
        />
      </label>
      <button disabled={pending}>{pending ? 'Menyimpan…' : 'Simpan detail media'}</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  )
}
