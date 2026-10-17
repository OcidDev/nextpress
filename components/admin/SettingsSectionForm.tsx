'use client'
import { siteConfig } from '@/data/site-config'
import { startTransition, useActionState, useState, type FormEvent } from 'react'
import type { SiteSettings } from '@/lib/content/settings'
import { saveSettings } from '@/server/actions/operations'
import { themeOptions } from '@/data/themes'
import type { CategoryNode } from '@/lib/core/category-tree'
import type { DefaultCategoryState } from '@/lib/db/queries/taxonomy'
import { MediaPicker } from './MediaPicker'

export function SettingsSectionForm({
  section,
  initial,
  categories = [],
  categoryDefault,
  pages = [],
}: {
  section: 'general' | 'writing' | 'reading' | 'permalinks' | 'discussion' | 'integrations'
  pages?: { id: string; title: string }[]
  initial: SiteSettings
  categories?: CategoryNode[]
  categoryDefault?: DefaultCategoryState
}) {
  const [value, setValue] = useState(() => ({
    ...initial,
    ...(section === 'writing' && categoryDefault?.id
      ? { defaultCategory: categoryDefault.id }
      : {}),
  }))
  const [state, action, pending] = useActionState(saveSettings, {})

  const patch =
    section === 'general'
      ? {
          name: value.name,
          description: value.description,
          logo: value.logo,
          icon: value.icon,
          siteUrl: value.siteUrl,
          adminEmail: value.adminEmail,
          usersCanRegister: value.usersCanRegister,
          defaultRole: value.defaultRole,
          timezone: value.timezone,
          dateFormat: value.dateFormat,
          timeFormat: value.timeFormat,
          startOfWeek: value.startOfWeek,
        }
      : section === 'writing'
        ? {
            defaultCategory: value.defaultCategory,
            defaultPostFormat: value.defaultPostFormat,
            pingSites: value.pingSites,
          }
        : section === 'reading'
          ? {
              defaultMode: value.defaultMode,
              defaultTheme: value.defaultTheme,
              showOnFront: value.showOnFront,
              pageOnFront: value.pageOnFront,
              pageForPosts: value.pageForPosts,
              postsPerPage: value.postsPerPage,
              postsPerRss: value.postsPerRss,
              rssUseExcerpt: value.rssUseExcerpt,
              blogPublic: value.blogPublic,
            }
          : section === 'permalinks'
            ? {
                permalinkStructure: value.permalinkStructure,
                categoryBase: value.categoryBase,
                tagBase: value.tagBase,
              }
            : section === 'discussion'
              ? { commentsEnabled: value.commentsEnabled }
              : { gaId: value.gaId, adsenseId: value.adsenseId, viewsEnabled: value.viewsEnabled }

  function update<K extends keyof SiteSettings>(key: K, next: SiteSettings[K]) {
    setValue((current) => ({ ...current, [key]: next }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    startTransition(() => action(data))
  }

  return (
    <form action={action} className="adminForm settingGroup" onSubmit={submit}>
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="settings" value={JSON.stringify(patch)} />

      {section === 'general' && (
        <>
          <label>
            Judul situs
            <input
              aria-label="Judul situs"
              required
              maxLength={100}
              value={value.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </label>
          <label>
            Slogan situs
            <textarea
              aria-label="Slogan situs"
              maxLength={500}
              value={value.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Dalam beberapa kata, jelaskan tentang apa situs ini."
            />
          </label>
          <label>
            Alamat email administrasi
            <input
              type="email"
              aria-label="Alamat email administrasi"
              value={value.adminEmail || ''}
              onChange={(e) => update('adminEmail', e.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--muted, #64748b)',
              margin: '-0.25rem 0 1rem',
            }}
          >
            Alamat administrasi tersimpan. Pengiriman notifikasi email belum tersedia.
          </p>

          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              disabled
              checked={value.usersCanRegister}
              onChange={(e) => update('usersCanRegister', e.target.checked)}
            />
            <span>Keanggotaan: Siapa saja dapat mendaftar (belum tersedia)</span>
          </label>

          <label>
            Peran baku pengguna baru
            <select
              disabled
              value={value.defaultRole}
              onChange={(e) => update('defaultRole', e.target.value as SiteSettings['defaultRole'])}
            >
              <option value="subscriber">Pelanggan (Subscriber)</option>
              <option value="contributor">Kontributor</option>
              <option value="author">Penulis (Author)</option>
              <option value="editor">Editor</option>
            </select>
          </label>

          <label>
            Zona waktu
            <select value={value.timezone} onChange={(e) => update('timezone', e.target.value)}>
              <option value="Asia/Jakarta">Asia/Jakarta (UTC+7 - WIB)</option>
              <option value="Asia/Makassar">Asia/Makassar (UTC+8 - WITA)</option>
              <option value="Asia/Jayapura">Asia/Jayapura (UTC+9 - WIT)</option>
              <option value="UTC">UTC (Universal Time Coordinated)</option>
            </select>
          </label>

          <label>
            Format tanggal
            <select value={value.dateFormat} onChange={(e) => update('dateFormat', e.target.value)}>
              <option value="d F Y">8 Oktober 2026 (d F Y)</option>
              <option value="Y-m-d">2026-10-08 (Y-m-d)</option>
              <option value="m/d/Y">10/08/2026 (m/d/Y)</option>
              <option value="d/m/Y">08/10/2026 (d/m/Y)</option>
            </select>
          </label>

          <label>
            Format waktu (belum digunakan oleh tampilan)
            <select
              disabled
              value={value.timeFormat}
              onChange={(e) => update('timeFormat', e.target.value)}
            >
              <option value="H:i">12:10 (24 Jam)</option>
              <option value="g:i a">12:10 pm (12 Jam)</option>
              <option value="g:i A">12:10 PM (12 Jam Huruf Besar)</option>
            </select>
          </label>

          <label>
            Hari pertama dalam minggu (kalender belum tersedia)
            <select
              disabled
              value={value.startOfWeek}
              onChange={(e) => update('startOfWeek', Number(e.target.value))}
            >
              <option value={1}>Senin</option>
              <option value={0}>Minggu</option>
              <option value={6}>Sabtu</option>
            </select>
          </label>

          <label>
            URL ikon situs (favicon)
            <input value={value.icon} onChange={(e) => update('icon', e.target.value)} />
          </label>
          <MediaPicker
            label="Pilih ikon situs"
            onSelect={(media) => update('icon', `/api/media/${media.id}`)}
          />
          <small>Gunakan gambar persegi. Kosongkan untuk memakai ikon bawaan.</small>
          <label>
            URL Logo
            <input
              aria-label="URL logo"
              value={value.logo}
              onChange={(e) => update('logo', e.target.value)}
            />
          </label>
          <MediaPicker
            label="Pilih logo dari pustaka media"
            onSelect={(media) => update('logo', `/api/media/${media.id}`)}
          />
        </>
      )}

      {section === 'writing' && (
        <>
          <label>
            Kategori pos baku
            <select
              aria-label="Kategori pos baku"
              value={value.defaultCategory}
              onChange={(e) => update('defaultCategory', e.target.value)}
              required
            >
              {!categories.some((category) => category.id === value.defaultCategory) && (
                <option value="">Pilih kategori baku</option>
              )}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {'— '.repeat(category.depth)}
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--muted, #64748b)',
              margin: '-0.25rem 0 1rem',
            }}
          >
            Kategori yang otomatis diterapkan jika tulisan baru disimpan tanpa memilih kategori.
          </p>

          {categoryDefault?.notice && (
            <p role="note" aria-label="Pemberitahuan kategori baku">
              {categoryDefault.notice}
            </p>
          )}
          <label>
            Format pos baku (belum tersedia)
            <select
              disabled
              value={value.defaultPostFormat}
              onChange={(e) => update('defaultPostFormat', e.target.value)}
            >
              <option value="standard">Standar</option>
              <option value="aside">Catatan samping</option>
              <option value="gallery">Galeri</option>
              <option value="link">Tautan</option>
              <option value="image">Gambar</option>
              <option value="quote">Kutipan</option>
              <option value="status">Status</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
          </label>

          <label>
            Layanan pembaruan (Ping Services)
            <textarea
              rows={4}
              disabled
              value={value.pingSites}
              onChange={(e) => update('pingSites', e.target.value)}
              placeholder="http://rpc.pingomatic.com/"
            />
          </label>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--muted, #64748b)',
              margin: '-0.25rem 0 1rem',
            }}
          >
            Layanan pembaruan belum didukung. Nilai tersimpan belum mengirim ping otomatis.
          </p>
        </>
      )}

      {section === 'reading' && (
        <>
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}>
            <legend style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Tampilan beranda
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="showOnFront"
                  checked={value.showOnFront === 'posts'}
                  onChange={() => update('showOnFront', 'posts')}
                />
                <span>Pos-pos terbaru Anda</span>
              </label>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="showOnFront"
                  checked={value.showOnFront === 'page'}
                  onChange={() => update('showOnFront', 'page')}
                />
                <span>Laman statis</span>
              </label>
            </div>
          </fieldset>

          {value.showOnFront === 'page' && (
            <>
              <label>
                Beranda
                <select
                  aria-label="Beranda"
                  value={value.pageOnFront}
                  onChange={(e) => update('pageOnFront', e.target.value)}
                >
                  <option value="">Pilih laman</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Laman pos
                <select
                  aria-label="Laman pos"
                  value={value.pageForPosts}
                  onChange={(e) => update('pageForPosts', e.target.value)}
                >
                  <option value="">Tidak dipilih</option>
                  {pages
                    .filter((page) => page.id !== value.pageOnFront)
                    .map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <label>
            Halaman blog menampilkan paling banyak
            <input
              type="number"
              min={1}
              max={100}
              value={value.postsPerPage}
              onChange={(e) => update('postsPerPage', Number(e.target.value) || 10)}
              style={{ width: '120px' }}
            />{' '}
            pos
          </label>

          <label>
            Umpan sindikasi (RSS/Atom) menampilkan paling banyak
            <input
              type="number"
              min={1}
              max={50}
              value={value.postsPerRss}
              onChange={(e) => update('postsPerRss', Number(e.target.value) || 10)}
              style={{ width: '120px' }}
            />{' '}
            item
          </label>

          <fieldset style={{ border: 'none', padding: 0, margin: '1rem 0' }}>
            <legend style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Untuk setiap pos dalam umpan, sertakan:
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="rssUseExcerpt"
                  checked={!value.rssUseExcerpt}
                  onChange={() => update('rssUseExcerpt', false)}
                />
                <span>Teks lengkap (Full text)</span>
              </label>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="rssUseExcerpt"
                  checked={value.rssUseExcerpt}
                  onChange={() => update('rssUseExcerpt', true)}
                />
                <span>Kutipan / Ringkasan (Excerpt)</span>
              </label>
            </div>
          </fieldset>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              margin: '1rem 0',
            }}
          >
            <input
              type="checkbox"
              checked={!value.blogPublic}
              onChange={(e) => update('blogPublic', !e.target.checked)}
            />
            <span>Minta mesin pencari untuk tidak mengindeks situs ini</span>
          </label>

          <hr
            style={{
              border: 'none',
              borderTop: '1px solid var(--border, #e2e8f0)',
              margin: '1.5rem 0',
            }}
          />

          <label>
            Mode tampilan bawaan
            <select
              aria-label="Mode bawaan"
              value={value.defaultMode}
              onChange={(e) => update('defaultMode', e.target.value as SiteSettings['defaultMode'])}
            >
              <option value="system">Sistem</option>
              <option value="light">Terang</option>
              <option value="dark">Gelap</option>
            </select>
          </label>

          <label>
            Palet warna bawaan
            <select
              aria-label="Tema bawaan"
              value={value.defaultTheme}
              onChange={(e) => update('defaultTheme', e.target.value)}
            >
              {themeOptions.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {section === 'permalinks' && (
        <>
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem' }}>
            <legend style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              Struktur permalink umum
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                {
                  label: 'Biasa (Plain)',
                  val: '/?p=%post_id%',
                  example: 'http://domain.com/?p=123',
                },
                {
                  label: 'Tanggal dan nama',
                  val: '/%year%/%monthnum%/%day%/%postname%/',
                  example: 'http://domain.com/2026/10/08/sampel-pos/',
                },
                {
                  label: 'Bulan dan nama',
                  val: '/%year%/%monthnum%/%postname%/',
                  example: 'http://domain.com/2026/10/sampel-pos/',
                },
                {
                  label: 'Numerik',
                  val: '/archives/%post_id%',
                  example: 'http://domain.com/archives/123',
                },
                {
                  label: 'Nama tulisan (Post name)',
                  val: '/%postname%/',
                  example: 'http://domain.com/sampel-pos/',
                },
              ].map((item) => (
                <label
                  key={item.val}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="permalinkStructure"
                    checked={value.permalinkStructure === item.val}
                    onChange={() => update('permalinkStructure', item.val)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <div>
                    <span style={{ fontWeight: 500 }}>{item.label}</span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        color: 'var(--muted, #64748b)',
                      }}
                    >
                      {item.example.replace('http://domain.com', siteConfig.url.replace(/\/$/, ''))}
                    </span>
                  </div>
                </label>
              ))}

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="permalinkStructure"
                  checked={
                    ![
                      '/?p=%post_id%',
                      '/%year%/%monthnum%/%day%/%postname%/',
                      '/%year%/%monthnum%/%postname%/',
                      '/archives/%post_id%',
                      '/%postname%/',
                    ].includes(value.permalinkStructure)
                  }
                  onChange={() => {
                    if (
                      [
                        '/?p=%post_id%',
                        '/%year%/%monthnum%/%day%/%postname%/',
                        '/%year%/%monthnum%/%postname%/',
                        '/archives/%post_id%',
                        '/%postname%/',
                      ].includes(value.permalinkStructure)
                    ) {
                      update('permalinkStructure', '/blog/%postname%')
                    }
                  }}
                  style={{ marginTop: '0.2rem' }}
                />
                <div style={{ width: '100%' }}>
                  <span style={{ fontWeight: 500 }}>Struktur kustom</span>
                  <input
                    type="text"
                    value={value.permalinkStructure}
                    onChange={(e) => update('permalinkStructure', e.target.value)}
                    style={{ marginTop: '0.25rem', width: '100%', maxWidth: '400px' }}
                    placeholder="/blog/%category%/%postname%"
                  />
                </div>
              </label>
            </div>
          </fieldset>

          <hr
            style={{
              border: 'none',
              borderTop: '1px solid var(--border, #e2e8f0)',
              margin: '1.5rem 0',
            }}
          />

          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
            Pengaturan opsional
          </h3>
          <label>
            Basis kategori
            <input
              type="text"
              value={value.categoryBase}
              onChange={(e) => update('categoryBase', e.target.value)}
              placeholder="category"
            />
          </label>
          <label>
            Basis tag
            <input
              type="text"
              value={value.tagBase}
              onChange={(e) => update('tagBase', e.target.value)}
              placeholder="tag"
            />
          </label>
        </>
      )}

      {section === 'discussion' && (
        <>
          <label>
            <span>Terima komentar pembaca</span>
            <select
              aria-label="Terima komentar pembaca"
              value={String(value.commentsEnabled)}
              onChange={(e) => update('commentsEnabled', e.target.value === 'true')}
            >
              <option value="true">Aktif</option>
              <option value="false">Tutup komentar baru</option>
            </select>
          </label>
          <p>
            Komentar baru menunggu moderasi. Komentar yang telah disetujui tetap tampil. Pengaturan
            ini berlaku untuk semua artikel.
          </p>
        </>
      )}

      {section === 'integrations' && (
        <>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={value.viewsEnabled}
              onChange={(e) => update('viewsEnabled', e.target.checked)}
            />
            <span>Hitung kunjungan situs dan artikel</span>
          </label>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--muted, #64748b)',
              margin: '-0.25rem 0 1rem',
            }}
          >
            Statistik dan artikel populer memakai kunjungan yang tercatat. Angka disembunyikan
            ketika penghitung belum aktif.
          </p>
          <label>
            Google Analytics ID
            <input
              aria-label="Google Analytics ID"
              value={value.gaId}
              onChange={(e) => update('gaId', e.target.value)}
              placeholder="G-…"
            />
          </label>
          <label>
            AdSense publisher ID
            <input
              aria-label="AdSense publisher ID"
              value={value.adsenseId}
              onChange={(e) => update('adsenseId', e.target.value)}
              placeholder="ca-pub-…"
            />
          </label>
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted, #64748b)' }}>
            Kosongkan untuk menonaktifkan. Skrip hanya dimuat setelah persetujuan pembaca.
          </p>
        </>
      )}

      {state.error && (
        <p role="alert" style={{ color: 'var(--danger, #ef4444)', marginTop: '0.5rem' }}>
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" style={{ color: 'var(--success, #16a34a)', marginTop: '0.5rem' }}>
          {state.success}
        </p>
      )}
      <button className="button" disabled={pending} style={{ marginTop: '1rem' }}>
        {pending ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
    </form>
  )
}
