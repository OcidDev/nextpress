'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { MediaMetadataForm, UploadForm } from './MediaForms'
import { MediaUrlField } from './MediaUrlField'
import { removeSelectedMedia } from '@/server/actions/operations'
import { listHref } from './AdminPagination'
import { SortableHeader } from './SortableHeader'
import type { ListParameters } from '@/lib/db/queries/admin-list'
import type { EditorMedia } from './MediaPicker'
export type LibraryMedia = EditorMedia & { mimeType: string; createdAt: string }
function date(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(
    new Date(value),
  )
}

export function AttachmentDetails({
  item,
  baseUrl,
  onDeleted,
}: {
  item: LibraryMedia
  baseUrl: string
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="attachmentDetails">
      <div className="attachmentPreview">
        <Image
          unoptimized
          src={`/api/media/${item.id}`}
          width={item.width}
          height={item.height}
          alt={item.alt || item.name}
        />
      </div>
      <aside className="attachmentSidebar">
        <dl className="adminMediaMetadata">
          <dt>Nama berkas</dt>
          <dd>{item.name}</dd>
          <dt>Jenis berkas</dt>
          <dd>{item.mimeType}</dd>
          <dt>Diunggah pada</dt>
          <dd>{date(item.createdAt)}</dd>
          <dt>Ukuran berkas</dt>
          <dd>{Math.ceil(item.size / 1024)} KB</dd>
          <dt>Dimensi</dt>
          <dd>
            {item.width} × {item.height} piksel
          </dd>
        </dl>
        <MediaMetadataForm key={item.id} item={item} />
        <MediaUrlField url={`${baseUrl}/api/media/${item.id}`} />
        <div className="adminActions">
          <a href={`/api/media/${item.id}`} target="_blank" rel="noreferrer">
            Lihat berkas
          </a>
          <button
            type="button"
            className="mediaDelete"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm('Hapus media ini secara permanen?')) return
              setBusy(true)
              setError('')
              try {
                const result = await removeSelectedMedia([item.id])
                if (result.deleted.length) onDeleted()
                else
                  setError(
                    'Media tidak dapat dihapus karena masih digunakan atau Anda tidak memiliki akses.',
                  )
              } catch {
                setError('Gagal menghapus media. Coba lagi.')
              } finally {
                setBusy(false)
              }
            }}
          >
            Hapus secara permanen
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </aside>
    </div>
  )
}
function AttachmentDialog({
  items,
  index,
  baseUrl,
  onIndex,
  onClose,
  onDeleted,
}: {
  items: LibraryMedia[]
  index: number
  baseUrl: string
  onIndex: (index: number) => void
  onClose: () => void
  onDeleted: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="mediaPicker attachmentDialog adminRoot"
      aria-labelledby="attachment-title"
      onCancel={onClose}
    >
      <header className="mediaPickerHeader">
        <h2 id="attachment-title">Detail lampiran</h2>
        <div className="adminActions">
          <button
            type="button"
            aria-label="Lampiran sebelumnya"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Lampiran berikutnya"
            disabled={index === items.length - 1}
            onClick={() => onIndex(index + 1)}
          >
            ›
          </button>
          <button type="button" aria-label="Tutup detail lampiran" onClick={onClose}>
            Tutup
          </button>
        </div>
      </header>
      <AttachmentDetails
        key={items[index]!.id}
        item={items[index]!}
        baseUrl={baseUrl}
        onDeleted={onDeleted}
      />
    </dialog>
  )
}
export function MediaLibrary({
  items,
  params,
  months,
  baseUrl,
  total,
}: {
  items: LibraryMedia[]
  params: ListParameters
  months: string[]
  baseUrl: string
  total: number
}) {
  const router = useRouter()
  const [upload, setUpload] = useState(false)
  const [index, setIndex] = useState<number | null>(null)
  const [bulk, setBulk] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  function toggle(id: string) {
    setSelected((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    )
  }
  async function remove() {
    if (
      !selected.length ||
      !window.confirm(
        `Hapus ${selected.length} media secara permanen? Media yang masih digunakan akan dipertahankan.`,
      )
    )
      return
    setPending(true)
    setNotice('')
    try {
      const result = await removeSelectedMedia(selected)
      setSelected(result.failed)
      setNotice(
        `${result.deleted.length} media dihapus.${result.failed.length ? ` ${result.failed.length} media dipertahankan karena masih digunakan atau tidak dapat dihapus.` : ''}`,
      )
      router.refresh()
    } catch {
      setNotice('Penghapusan gagal. Periksa koneksi lalu coba lagi.')
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <div className="adminPageHeading mediaLibraryHeading">
        <h1>Pustaka Media</h1>
        <button
          type="button"
          className="button secondary"
          aria-expanded={upload}
          onClick={() => setUpload(!upload)}
        >
          Tambah berkas media
        </button>
      </div>
      {upload && (
        <section className="mediaLibraryUpload" aria-label="Unggah gambar">
          <UploadForm />
        </section>
      )}
      {notice && (
        <p role="status" className="adminNotice">
          {notice}
        </p>
      )}
      <div className="mediaLibraryToolbar">
        <nav className="adminViewToggle" aria-label="Tampilan media">
          <Link
            aria-label="Tampilan grid"
            href={listHref('/admin/media', params, { view: 'grid' })}
            aria-current={params.view === 'grid' ? 'page' : undefined}
          >
            ▦ <span>Grid</span>
          </Link>
          <Link
            aria-label="Tampilan daftar"
            href={listHref('/admin/media', params, { view: 'list' })}
            aria-current={params.view === 'list' ? 'page' : undefined}
          >
            ☷ <span>Daftar</span>
          </Link>
        </nav>
        <form className="mediaLibraryFilters" method="get">
          <input type="hidden" name="view" value={params.view} />
          <input type="hidden" name="sort" value={params.sort} />
          <input type="hidden" name="dir" value={params.dir} />
          <label>
            <span className="srOnly">Filter tanggal</span>
            <select name="month" defaultValue={params.month || ''}>
              <option value="">Semua tanggal</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(
                    new Date(`${month}-01T12:00:00Z`),
                  )}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="srOnly">Cari media</span>
            <input
              name="q"
              type="search"
              placeholder="Cari media…"
              defaultValue={params.q}
              maxLength={120}
            />
          </label>
          <button type="submit">Filter</button>
        </form>
        <button
          type="button"
          aria-pressed={bulk}
          onClick={() => {
            setBulk(!bulk)
            setSelected([])
          }}
        >
          {bulk ? 'Batalkan pilihan' : 'Pilih massal'}
        </button>
      </div>
      {bulk && (
        <div className="mediaBulkBar">
          <label className="adminCheck">
            <input
              type="checkbox"
              aria-label="Pilih semua media pada halaman ini"
              checked={items.length > 0 && selected.length === items.length}
              onChange={(e) => setSelected(e.target.checked ? items.map((item) => item.id) : [])}
            />
            Pilih semua
          </label>
          <span>{selected.length} dipilih</span>
          <button type="button" disabled={!selected.length || pending} onClick={remove}>
            Hapus terpilih secara permanen
          </button>
        </div>
      )}
      {params.view === 'grid' ? (
        <div className="wpMediaGrid">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className="wpMediaTile"
              aria-label={`Detail ${item.title || item.name}`}
              aria-pressed={bulk ? selected.includes(item.id) : undefined}
              onClick={() => (bulk ? toggle(item.id) : setIndex(i))}
            >
              <Image
                unoptimized
                src={`/api/media/${item.id}`}
                width={item.width}
                height={item.height}
                alt={item.alt || item.name}
              />
              <span className="wpMediaTileName">{item.title || item.name}</span>
              {bulk && (
                <span className="wpMediaTick" aria-hidden="true">
                  {selected.includes(item.id) ? '✓' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="tableWrap">
          <table className="adminTable adminMediaTable">
            <thead>
              <tr>
                {bulk && <th>Pilih</th>}
                <SortableHeader
                  column="name"
                  label="Berkas"
                  basePath="/admin/media"
                  params={params}
                  currentSort={params.sort}
                  currentDir={params.dir}
                  defaultDir="asc"
                />
                <th>Dimensi</th>
                <th>Teks alternatif</th>
                <SortableHeader
                  column="createdAt"
                  label="Diunggah"
                  basePath="/admin/media"
                  params={params}
                  currentSort={params.sort}
                  currentDir={params.dir}
                  defaultDir="desc"
                />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id}>
                  {bulk && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${item.name}`}
                        checked={selected.includes(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                    </td>
                  )}
                  <td>
                    <div className="mediaListFile">
                      <button
                        type="button"
                        className="mediaListThumbnail"
                        onClick={() => setIndex(i)}
                        aria-label={`Detail ${item.name}`}
                      >
                        <Image
                          unoptimized
                          src={`/api/media/${item.id}`}
                          width={80}
                          height={60}
                          alt=""
                        />
                      </button>
                      <div>
                        <button
                          className="adminTextButton"
                          type="button"
                          onClick={() => setIndex(i)}
                        >
                          {item.title || item.name}
                        </button>
                        <small className="adminListSecondary">{item.name}</small>
                        <Link href={`/admin/media/${item.id}`}>Edit detail</Link>
                      </div>
                    </div>
                  </td>
                  <td>
                    {item.width} × {item.height}
                    <small className="adminListSecondary">{Math.ceil(item.size / 1024)} KB</small>
                  </td>
                  <td>{item.alt || '—'}</td>
                  <td>{date(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!items.length && (
        <p className="mediaLibraryEmpty">
          {params.q || params.month
            ? 'Tidak ada media yang sesuai dengan filter.'
            : 'Belum ada media. Tambahkan berkas pertama Anda.'}
        </p>
      )}
      <p className="mediaLibraryCount">{total} berkas media</p>
      {index !== null &&
        items[index] &&
        createPortal(
          <AttachmentDialog
            items={items}
            index={index}
            baseUrl={baseUrl}
            onIndex={setIndex}
            onClose={() => {
              setIndex(null)
              router.refresh()
            }}
            onDeleted={() => {
              setIndex(null)
              router.refresh()
            }}
          />,
          document.body,
        )}
    </>
  )
}
