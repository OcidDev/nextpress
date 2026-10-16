'use client'

import { useActionState, useState } from 'react'
import {
  saveProfileIdentity,
  saveProfileEmail,
  saveProfilePassword,
} from '@/server/actions/profile'
import { MediaPicker } from './MediaPicker'
import type { getPersonalProfile } from '@/lib/db/queries/profile'

type ProfileData = Awaited<ReturnType<typeof getPersonalProfile>>

export function ProfileIdentityForm({ data }: { data: ProfileData }) {
  const [state, action, pending] = useActionState(saveProfileIdentity, {})
  const [image, setImage] = useState(data.user.image || data.author?.avatar || '')

  return (
    <form className="adminForm panel" action={action}>
      <h2>Identitas Profil</h2>
      <div className="profilePhotoSection">
        <label>Foto profil</label>
        <div className="profilePhotoRow">
          <div className="profilePhotoPreview">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Pratinjau foto profil" className="profileAvatarImg" />
            ) : (
              <span className="profileAvatarPlaceholder" aria-hidden="true">
                {data.user.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="profilePhotoActions">
            {data.canUpload && (
              <MediaPicker
                onSelect={(media) => setImage(`/api/media/${media.id}`)}
                label={image ? 'Ganti foto' : 'Pilih foto'}
              />
            )}
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
        <input type="hidden" name="image" value={image} />
        <small>Foto akan tampil pada profil Anda dan kartu penulis artikel.</small>
      </div>

      <label>
        Nama lengkap
        <input
          name="name"
          defaultValue={data.user.name}
          required
          maxLength={120}
          autoComplete="name"
        />
      </label>

      <label>
        Email akun
        <input value={data.user.email} readOnly disabled className="readOnlyInput" />
        <small>Untuk mengubah alamat email, gunakan formulir Ubah Email di bawah.</small>
      </label>

      <label>
        Peran CMS
        <input value={data.roleLabel} readOnly disabled className="readOnlyInput" />
      </label>

      <label>
        Bio penulis
        <textarea
          name="bio"
          defaultValue={data.author?.bio || ''}
          maxLength={5000}
          rows={4}
          placeholder="Ceritakan sedikit tentang Anda..."
        />
      </label>

      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}

      <button className="button" disabled={pending}>
        {pending ? 'Menyimpan…' : 'Simpan profil'}
      </button>
    </form>
  )
}

export function ProfileEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, pending] = useActionState(saveProfileEmail, {})

  return (
    <form className="adminForm panel" action={action}>
      <h2>Ubah Email</h2>
      <p>
        Email saat ini: <strong>{currentEmail}</strong>
      </p>

      <label>
        Email baru
        <input name="newEmail" type="email" required maxLength={200} autoComplete="email" />
      </label>

      <label>
        Kata sandi saat ini
        <input
          name="currentPassword"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
        />
      </label>
      <small>
        Perubahan email mencabut semua sesi masuk. Anda akan diminta masuk kembali dengan email
        baru.
      </small>

      {state.error && <p role="alert">{state.error}</p>}

      <button className="button" disabled={pending}>
        {pending ? 'Memperbarui…' : 'Perbarui email'}
      </button>
    </form>
  )
}

export function ProfilePasswordForm() {
  const [state, action, pending] = useActionState(saveProfilePassword, {})

  return (
    <form className="adminForm panel" action={action}>
      <h2>Ubah Kata Sandi</h2>

      <label>
        Kata sandi saat ini
        <input
          name="currentPassword"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
        />
      </label>

      <label>
        Kata sandi baru
        <input
          name="newPassword"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>

      <label>
        Konfirmasi kata sandi baru
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      <small>Minimal 12 karakter. Perubahan kata sandi mencabut seluruh sesi akun Anda.</small>

      {state.error && <p role="alert">{state.error}</p>}

      <button className="button" disabled={pending}>
        {pending ? 'Memperbarui…' : 'Perbarui kata sandi'}
      </button>
    </form>
  )
}
