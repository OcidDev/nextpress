'use client'

import { useActionState, useState } from 'react'
import { saveUser } from '@/server/actions/users'
import { MediaPicker } from './MediaPicker'
import type { userEditor } from '@/lib/db/queries/users'

export function UserForm({ data }: { data: NonNullable<Awaited<ReturnType<typeof userEditor>>> }) {
  const [state, action, pending] = useActionState(saveUser, {})
  const [image, setImage] = useState(data.user?.image || data.author?.avatar || '')

  return (
    <form className="adminForm panel" action={action}>
      <input type="hidden" name="id" value={data.user?.id || ''} />

      <div className="profilePhotoSection">
        <label>Foto profil</label>
        <div className="profilePhotoRow">
          <div className="profilePhotoPreview">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Pratinjau foto profil" className="profileAvatarImg" />
            ) : (
              <span className="profileAvatarPlaceholder" aria-hidden="true">
                {(data.user?.name || 'U').slice(0, 1).toUpperCase()}
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
        <input type="hidden" name="image" value={image} />
        <small>Foto akan tampil pada kartu penulis artikel dan menu akun.</small>
      </div>

      <label>
        Nama
        <input
          name="name"
          defaultValue={data.user?.name}
          required
          maxLength={120}
          autoComplete="name"
        />
      </label>

      <label>
        Email
        <input
          name="email"
          type="email"
          defaultValue={data.user?.email}
          required
          maxLength={200}
          autoComplete="off"
        />
      </label>

      <label>
        Peran
        <select name="role" defaultValue={data.user?.role || 'author'}>
          {Object.entries(data.roles).map(([name, definition]) => (
            <option key={name} value={name}>
              {definition.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Status akun
        <select name="active" defaultValue={String(data.user?.active ?? true)}>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </label>

      <label>
        {data.user ? 'Kata sandi baru' : 'Kata sandi'}
        <input
          name="password"
          type="password"
          required={!data.user}
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      <small>
        {data.user ? 'Kosongkan jika tidak mengganti kata sandi. ' : ''}Minimal 12 karakter.
        Perubahan kata sandi, email, peran, atau penonaktifan mencabut sesi akun.
      </small>

      <label>
        Profil penulis
        <select name="profileId" defaultValue={data.profileId} disabled={!!data.profileId}>
          <option value="">Buat profil otomatis dari nama akun</option>
          {data.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      {data.profileId && <input type="hidden" name="profileId" value={data.profileId} />}
      <small>
        Profil lama yang belum tertaut dapat dipilih. Artikel tetap memakai profil penulis asalnya.
      </small>

      <fieldset className="adminFormSection">
        <legend>Detail Profil Penulis</legend>

        <label>
          Slug profil
          <input
            name="slug"
            defaultValue={data.author?.slug || ''}
            maxLength={160}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="otomatis-dari-nama"
          />
        </label>
        <small>
          Huruf kecil, angka, dan tanda hubung. Dibuat otomatis jika dikosongkan pada akun baru.
        </small>

        <label>
          Teks peran publik
          <input
            name="authorRole"
            defaultValue={data.author?.role || ''}
            maxLength={80}
            placeholder="Contoh: Penulis, Redaktur, Kontributor"
          />
        </label>

        <label>
          Bio penulis
          <textarea
            name="bio"
            defaultValue={data.author?.bio || ''}
            maxLength={5000}
            rows={3}
            placeholder="Biografi singkat penulis..."
          />
        </label>

        <label className="adminCheck">
          <input
            type="checkbox"
            name="verified"
            value="true"
            defaultChecked={data.author?.verified ?? false}
          />
          Penulis terverifikasi
        </label>

        <details className="adminSocialLinks">
          <summary>Tautan sosial media</summary>
          <label>
            Twitter / X
            <input
              name="twitter"
              type="url"
              defaultValue={data.author?.social?.twitter || ''}
              maxLength={200}
              placeholder="https://x.com/username"
            />
          </label>
          <label>
            Instagram
            <input
              name="instagram"
              type="url"
              defaultValue={data.author?.social?.instagram || ''}
              maxLength={200}
              placeholder="https://instagram.com/username"
            />
          </label>
          <label>
            Facebook
            <input
              name="facebook"
              type="url"
              defaultValue={data.author?.social?.facebook || ''}
              maxLength={200}
              placeholder="https://facebook.com/username"
            />
          </label>
          <label>
            Situs web
            <input
              name="website"
              type="url"
              defaultValue={data.author?.social?.website || ''}
              maxLength={200}
              placeholder="https://example.com"
            />
          </label>
        </details>
      </fieldset>

      {state.error && <p role="alert">{state.error}</p>}
      <button className="button" disabled={pending}>
        {pending ? 'Menyimpan…' : 'Simpan pengguna'}
      </button>
    </form>
  )
}
