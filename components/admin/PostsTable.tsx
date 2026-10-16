'use client'

import { Fragment, useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { bulkPostStatus, deletePost, quickEditPost } from '@/server/actions/content'
import { DeleteForm } from './DeleteForm'
import { formatDate } from '@/lib/utils'
import type { listedPosts } from '@/lib/db/queries/admin-list'
import { SortableHeader } from './SortableHeader'

type Post = Awaited<ReturnType<typeof listedPosts>>['rows'][number]
const columns = [
  { key: 'author', label: 'Penulis', sortColumn: 'author' },
  { key: 'status', label: 'Status', sortColumn: 'status' },
  { key: 'comments', label: 'Komentar', sortColumn: 'comments' },
  { key: 'date', label: 'Diperbarui', sortColumn: 'updatedAt' },
] as const
type Column = (typeof columns)[number]['key']

function usePreserveFormValues() {
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const element = form.current
    // Action completion can reset controls before React's deferred reset handler runs.
    const preserve = (event: Event) => event.preventDefault()
    element?.addEventListener('reset', preserve)
    return () => element?.removeEventListener('reset', preserve)
  }, [])
  return form
}

function QuickEdit({
  post,
  onClose,
  onSaved,
  onPending,
  canPublish,
}: {
  post: Post
  canPublish: boolean
  onClose: () => void
  onSaved: () => void
  onPending: (pending: boolean) => void
}) {
  const [state, action, pending] = useActionState(quickEditPost, {})
  const form = usePreserveFormValues()
  const [fields, setFields] = useState(() => ({
    title: post.title,
    slug: post.slug,
    status: post.status,
  }))
  const title = useRef<HTMLInputElement>(null)
  // Keep the original version for this editing session, even if the list refreshes.
  const [version] = useState(() => (post.updatedAt || post.publishedAt).toISOString())
  useEffect(() => {
    title.current?.focus()
  }, [])
  useEffect(() => {
    onPending(pending)
    return () => onPending(false)
  }, [pending, onPending])
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])
  return (
    <form
      ref={form}
      id={`post-quick-${post.id}`}
      action={action}
      className="adminForm adminQuickEdit"
      aria-label={`Edit Cepat ${post.title}`}
      onSubmit={(event) => {
        if (pending) event.preventDefault()
      }}
    >
      <h2>Edit Cepat</h2>
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="version" value={version} />
      <div className="adminQuickEditFields">
        <label>
          Judul
          <input
            ref={title}
            name="title"
            disabled={pending}
            required
            maxLength={250}
            value={fields.title}
            onChange={(event) =>
              setFields((current) => ({ ...current, title: event.target.value }))
            }
          />
        </label>
        <label>
          Slug
          <input
            name="slug"
            disabled={pending}
            required
            maxLength={160}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={fields.slug}
            onChange={(event) => setFields((current) => ({ ...current, slug: event.target.value }))}
          />
        </label>
        <label>
          Status
          <select
            name="status"
            disabled={pending}
            value={fields.status}
            onChange={(event) =>
              setFields((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="draft">Draft</option>
            <option value="pending">Menunggu review</option>
            {canPublish && <option value="published">Terbit</option>}
          </select>
        </label>
      </div>
      <p>Isi, penulis, kategori, tag, gambar, dan SEO tetap tersimpan.</p>
      {state.error && <p role="alert">{state.error}</p>}
      <div className="adminActions">
        <button className="button" disabled={pending}>
          {pending ? 'Menyimpan…' : 'Simpan perubahan'}
        </button>
        <button type="button" disabled={pending} onClick={onClose}>
          Batal
        </button>
      </div>
    </form>
  )
}

export function PostsTable({
  rows,
  canPublish,
  userId,
  searchParams = {},
  currentSort,
  currentDir,
}: {
  rows: Post[]
  canPublish: boolean
  userId: string
  searchParams?: Record<string, unknown>
  currentSort?: string
  currentDir?: 'asc' | 'desc'
}) {
  const [visible, setVisible] = useState<Column[]>(columns.map((column) => column.key))
  const storageKey = `nextpress:post-columns:${userId}`
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (
        Array.isArray(saved) &&
        saved.every((key) => columns.some((column) => column.key === key))
      )
        setVisible([...new Set(saved)] as Column[])
    } catch {
      /* Screen options work even when browser storage is unavailable. */
    }
  }, [storageKey])
  function toggleColumn(key: Column) {
    const next = visible.includes(key)
      ? visible.filter((value) => value !== key)
      : [...visible, key]
    setVisible(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* Optional preference. */
    }
  }
  const editableRows = rows.filter((post) => post.canEdit)
  const [selected, setSelected] = useState<string[]>([])
  const selectedVersions = useRef(new Map<string, string>())
  function selectPost(post: Post, checked: boolean) {
    if (checked)
      selectedVersions.current.set(post.id, (post.updatedAt || post.publishedAt).toISOString())
    else selectedVersions.current.delete(post.id)
    setSelected((current) =>
      checked ? [...current, post.id] : current.filter((id) => id !== post.id),
    )
  }
  const [bulkStatus, setBulkStatus] = useState('draft')
  const [editing, setEditing] = useState<string | null>(null)
  const [quickPending, setQuickPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [state, action, pending] = useActionState(bulkPostStatus, {})
  const form = usePreserveFormValues()
  const all = useRef<HTMLInputElement>(null)
  const busy = pending || quickPending
  useEffect(() => {
    if (all.current)
      all.current.indeterminate = selected.length > 0 && selected.length < editableRows.length
  }, [selected.length, editableRows.length])
  useEffect(() => {
    setSelected((current) => current.filter((id) => rows.some((post) => post.id === id)))
    setEditing((current) => (rows.some((post) => post.id === current) ? current : null))
  }, [rows])
  useEffect(() => {
    if (state.success) {
      setSelected([])
      setNotice(state.success)
    }
  }, [state])
  return (
    <>
      <details className="adminScreenOptions">
        <summary>Opsi layar</summary>
        <fieldset>
          <legend>Kolom daftar artikel</legend>
          {columns.map((column) => (
            <label key={column.key}>
              <input
                type="checkbox"
                checked={visible.includes(column.key)}
                onChange={() => toggleColumn(column.key)}
              />
              {column.label}
            </label>
          ))}
        </fieldset>
      </details>
      <form
        ref={form}
        action={action}
        className="adminBulkActions"
        aria-label="Tindakan massal artikel"
      >
        {selected.map((id) => (
          <Fragment key={id}>
            <input type="hidden" name="ids" value={id} />
            <input
              type="hidden"
              name={`version:${id}`}
              value={selectedVersions.current.get(id) || ''}
            />
          </Fragment>
        ))}
        <label>
          Tindakan massal
          <select
            name="status"
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value)}
            disabled={busy}
          >
            <option value="draft">Jadikan draft</option>
            <option value="pending">Kirim untuk review</option>
            {canPublish && <option value="published">Terbitkan</option>}
          </select>
        </label>
        <button disabled={busy || !selected.length}>{pending ? 'Memproses…' : 'Terapkan'}</button>
        <span>{selected.length} artikel dipilih pada halaman ini</span>
      </form>
      {state.error && <p role="alert">{state.error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="tableWrap">
        <table className="adminTable adminPostsTable">
          <thead>
            <tr>
              <th className="adminSelectionCell">
                <input
                  ref={all}
                  type="checkbox"
                  aria-label="Pilih semua artikel pada halaman ini"
                  disabled={busy || !editableRows.length}
                  checked={editableRows.length > 0 && selected.length === editableRows.length}
                  onChange={(event) => {
                    selectedVersions.current = new Map(
                      event.target.checked
                        ? editableRows.map((post) => [
                            post.id,
                            (post.updatedAt || post.publishedAt).toISOString(),
                          ])
                        : [],
                    )
                    setSelected(event.target.checked ? editableRows.map((post) => post.id) : [])
                  }}
                />
              </th>
              <SortableHeader
                column="title"
                label="Judul"
                basePath="/admin/posts"
                params={searchParams}
                currentSort={currentSort}
                currentDir={currentDir}
                defaultDir="asc"
              />
              {columns
                .filter((column) => visible.includes(column.key))
                .map((column) => (
                  <SortableHeader
                    key={column.key}
                    column={column.sortColumn}
                    label={column.label}
                    basePath="/admin/posts"
                    params={searchParams}
                    currentSort={currentSort}
                    currentDir={currentDir}
                    defaultDir={column.sortColumn === 'updatedAt' ? 'desc' : 'asc'}
                  />
                ))}
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((post) => (
              <Fragment key={post.id}>
                <tr>
                  <td className="adminSelectionCell">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${post.title}`}
                      disabled={busy || !post.canEdit}
                      checked={selected.includes(post.id)}
                      onChange={(event) => selectPost(post, event.target.checked)}
                    />
                  </td>
                  <td>
                    <Link href={`/admin/posts/${post.id}`}>{post.title}</Link>
                    <small className="adminListSecondary">/{post.slug}</small>
                  </td>
                  {visible.includes('author') && <td>{post.authorName}</td>}
                  {visible.includes('status') && (
                    <td>
                      <span
                        className={`adminBadge ${post.status === 'published' ? 'success' : 'muted'}`}
                      >
                        {post.status === 'published'
                          ? 'Terbit'
                          : post.status === 'pending'
                            ? 'Menunggu review'
                            : 'Draft'}
                      </span>
                    </td>
                  )}
                  {visible.includes('comments') && <td>{post.commentCount}</td>}
                  {visible.includes('date') && (
                    <td>{formatDate((post.updatedAt || post.publishedAt).toISOString())}</td>
                  )}
                  <td>
                    <div className="adminRowActions">
                      {post.canEdit && <Link href={`/admin/posts/${post.id}`}>Edit</Link>}
                      <button
                        id={`post-quick-trigger-${post.id}`}
                        type="button"
                        disabled={busy || !post.canEdit}
                        aria-expanded={editing === post.id}
                        aria-controls={editing === post.id ? `post-quick-${post.id}` : undefined}
                        onClick={() => {
                          setEditing(editing === post.id ? null : post.id)
                          setNotice('')
                        }}
                      >
                        Edit Cepat
                      </button>
                      <Link href={`/admin/posts/${post.id}/preview`}>Preview</Link>
                      {post.canDelete && <DeleteForm id={post.id} action={deletePost} />}
                    </div>
                  </td>
                </tr>
                {editing === post.id && (
                  <tr className="adminQuickEditRow">
                    <td colSpan={3 + visible.length}>
                      <QuickEdit
                        key={post.id}
                        post={post}
                        canPublish={canPublish}
                        onPending={setQuickPending}
                        onClose={() => {
                          setEditing(null)
                          document.getElementById(`post-quick-trigger-${post.id}`)?.focus()
                        }}
                        onSaved={() => {
                          setEditing(null)
                          setNotice('Artikel tersimpan.')
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
