'use client'

import { useActionState, useState } from 'react'
import { saveLegacyAuthor } from '@/server/actions/users'
import { MediaPicker } from './MediaPicker'
import type { legacyAuthorEditor } from '@/lib/db/queries/users'

export function LegacyAuthorForm({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof legacyAuthorEditor>>>
}) {
  const [state, action, pending] = useActionState(saveLegacyAuthor, {})
  const [image, setImage] = useState(data.profile.avatar || '')

  return (
    <form className="adminForm panel" action={action}>
      <input type="hidden" name="id" value={data.profile.id} />

      <div className="profilePhotoSection">
        <label>Foto profil / Avatar</label>
        <div className="profilePhotoRow">
          <div className="profilePhotoPreview">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Pratinjau avatar" className="profileAvatarImg" />
            ) : (
              <span className="profileAvatarPlaceholder" aria-hidden="true">
                {data.profile.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="profilePhotoActions">
            <MediaPicker
              onSelect={(media) => setImage(`/api/media/${media.id}`)}
              label={image ? 'Ganti foto' : 'Pilih foto'}
            />
            {image && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setImage('')}
                disabled={pending}
              >
                Hapus foto
              </button>
            )}
          </div>
        </div>
        <input type="hidden" name="avatar" value={image} />
      </div>

      <label>
        Nama penulis
        <input
          name="name"
          defaultValue={data.profile.name}
          required
          maxLength={120}
        />
      </label>

      <label>
        Slug
        <input
          name="slug"
          defaultValue={data.profile.slug}
          required
          maxLength={160}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
      </label>
      <small>Huruf kecil, angka, dan tanda hubung.</small>

      <label>
        Teks peran publik
        <input
          name="authorRole"
          defaultValue={data.profile.role || ''}
          maxLength={80}
          placeholder="Contoh: Penulis Tamu, Mantan Kontributor"
        />
      </label>

      <label>
        Bio
        <textarea
          name="bio"
          defaultValue={data.profile.bio || ''}
          maxLength={5000}
          rows={3}
        />
      </label>

      <label className="adminCheck">
        <input
          type="checkbox"
          name="verified"
          value="true"
          defaultChecked={data.profile.verified}
        />
        Penulis terverifikasi
      </label>

      {data.eligibleUsers.length > 0 && (
        <label>
          Tautkan ke akun login
          <select name="userId" defaultValue="">
            <option value="">Jangan tautkan (tetap profil lama tanpa akun)</option>
            {data.eligibleUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <small>
            Setelah ditautkan, pemilik akun akan memiliki akses mengelola artikel profil ini.
            Penautan bersifat permanen dan tidak dapat dialihkan ke akun lain.
          </small>
        </label>
      )}

      {state.error && <p role="alert">{state.error}</p>}

      <button className="button" disabled={pending}>
        {pending ? 'Menyimpan…' : 'Simpan profil lama'}
      </button>
    </form>
  )
}
