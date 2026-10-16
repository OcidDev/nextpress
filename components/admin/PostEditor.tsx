'use client'

import { formatPostPermalink } from '@/lib/core/permalinks'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { savePost } from '@/server/actions/content'
import { quickAddCategory } from '@/server/actions/taxonomy'
import { HtmlEditor } from './HtmlEditor'
import { MediaPicker } from './MediaPicker'
import { useEditorSave } from './useEditorSave'
import { editorSaveShortcut } from './editorSaveShortcut'
import { buildCategoryTree } from '@/lib/core/category-tree'
import { slugify } from '@/lib/utils'
import type { adminPost, editorOptions } from '@/lib/db/queries/admin-content'

function initialFields(post?: Awaited<ReturnType<typeof adminPost>>) {
  return {
    title: post?.title || '',
    slug: post?.slug || '',
    excerpt: post?.excerpt || '',
    status:
      post?.status === 'published' ? 'published' : post?.status === 'pending' ? 'pending' : 'draft',
    categories: post?.categoryIds || [],
    tags: post?.tags.join(', ') || '',
  }
}

export function PostEditor({
  post,
  options,
  saved = false,
}: {
  post?: Awaited<ReturnType<typeof adminPost>>
  options: Awaited<ReturnType<typeof editorOptions>>
  saved?: boolean
}) {
  const [fields, setFields] = useState(() => initialFields(post))
  const savedPermalink =
    post &&
    fields.slug === post.slug &&
    fields.categories.length === post.categoryIds.length &&
    fields.categories.every((id) => post.categoryIds.includes(id))
      ? post.permalink
      : undefined
  const [categoriesList, setCategoriesList] = useState(options.categories)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState('')
  const [catError, setCatError] = useState('')
  const [isAddingCat, setIsAddingCat] = useState(false)
  const [slugManual, setSlugManual] = useState(!!post?.id)
  const [initialContent] = useState(post?.content || '')
  const [cover, setCover] = useState(post?.featuredImage || '')
  const [coverAlt, setCoverAlt] = useState(post?.featuredImageAlt || '')
  const { form, state, action, pending, navigating, dirty, markDirty, onSubmit, record } =
    useEditorSave({
      initial: {
        id: post?.id || '',
        slug: post?.slug || '',
        version: (post?.updatedAt || post?.publishedAt)?.toISOString() || '',
      },
      kind: 'posts',
      save: savePost,
      initialSuccess: saved ? 'Artikel tersimpan.' : undefined,
      onSaved(saved, submitted) {
        setFields((current) => ({
          ...current,
          ...(current.slug === submitted.get('slug') ? { slug: saved.slug } : {}),
          ...(current.status === submitted.get('status')
            ? { status: saved.status || current.status }
            : {}),
        }))
        setSlugManual(true)
      },
    })
  function update<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    if (key === 'slug') setSlugManual(true)
    setFields((current) => ({
      ...current,
      [key]: value,
      ...(key === 'title' && !slugManual && !record.id
        ? { slug: slugify(String(value)).slice(0, 160).replace(/-+$/, '') }
        : {}),
    }))
  }

  const handleQuickAddCategory = async () => {
    const trimmed = newCatName.trim()
    if (!trimmed) return
    setIsAddingCat(true)
    setCatError('')
    try {
      const res = await quickAddCategory({ name: trimmed, parentId: newCatParent || null })
      if (res.success && res.category) {
        const cat = res.category
        if (!categoriesList.some((c) => c.id === cat.id)) {
          setCategoriesList((prev) => buildCategoryTree([...prev, cat]))
        }
        if (!fields.categories.includes(cat.id)) {
          update('categories', [...fields.categories, cat.id])
          markDirty()
        }
        setNewCatName('')
        setNewCatParent('')
        setShowAddCategory(false)
      } else {
        setCatError(res.error || 'Gagal menambahkan kategori.')
      }
    } catch (e) {
      setCatError(e instanceof Error ? e.message : 'Terjadi kesalahan.')
    } finally {
      setIsAddingCat(false)
    }
  }

  const coverPreview = /^https?:\/\//i.test(cover) || /^\/api\/media\/[a-f0-9]{32}$/.test(cover)
  return (
    <form
      ref={form}
      action={action}
      className="adminForm adminEditorForm"
      inert={navigating}
      onChange={markDirty}
      onSubmit={onSubmit}
      onReset={(event) => event.preventDefault()}
      onKeyDown={(event) => editorSaveShortcut(event, pending)}
    >
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="version" value={record.version} />
      <input type="hidden" name="slugMode" value={slugManual ? 'manual' : 'auto'} />
      <div className="adminEditorLayout">
        <div className="adminEditorMain">
          <section className="adminEditorPanel">
            <label>
              Judul
              <input
                name="title"
                required
                maxLength={250}
                value={fields.title}
                onChange={(event) => update('title', event.target.value)}
              />
            </label>
            <label>
              Slug
              <input
                name="slug"
                required={slugManual}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={160}
                value={fields.slug}
                onChange={(event) => update('slug', event.target.value)}
              />
            </label>
            <small>
              {savedPermalink ? 'URL' : 'Perkiraan URL'}:{' '}
              {savedPermalink ||
                formatPostPermalink(
                  {
                    id: record.id || 'ID-setelah-disimpan',
                    slug: fields.slug || 'sampel-pos',
                    publishedAt: post?.publishedAt,
                    authorSlug: post?.authorSlug || options.author.slug,
                    categorySlug: categoriesList.find((category) =>
                      fields.categories.includes(category.id),
                    )?.slug,
                  },
                  options.permalinkSettings,
                )}
            </small>
            <label>
              Ringkasan
              <textarea
                name="excerpt"
                maxLength={500}
                value={fields.excerpt}
                onChange={(event) => update('excerpt', event.target.value)}
              />
            </label>
          </section>
          <HtmlEditor canUpload={options.canUpload} content={initialContent} onChange={markDirty} />
        </div>
        <aside className="adminEditorAside" aria-label="Pengaturan artikel">
          <section className="adminEditorPanel">
            <h2>Publikasi</h2>
            <label>
              Status
              <select
                name="status"
                value={fields.status}
                onChange={(event) => update('status', event.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="pending">Menunggu tinjauan</option>
                {options.canPublish && <option value="published">Terbit</option>}
              </select>
            </label>
            <label>
              Penulis
              <input readOnly value={post?.authorName || options.author.name} />
            </label>
            <p className="adminEditorSaveState" aria-live="polite">
              {pending
                ? 'Menyimpan perubahan…'
                : dirty
                  ? 'Ada perubahan yang belum disimpan.'
                  : 'Siap diedit.'}
            </p>
            {state.error && <p role="alert">{state.error}</p>}
            {state.success && <p role="status">{state.success}</p>}
            <div className="adminActions">
              <button className="button" disabled={pending}>
                {pending ? 'Menyimpan…' : 'Simpan artikel'}
              </button>
              {options.canPublish && fields.status !== 'published' && (
                <button className="button" disabled={pending} name="intent" value="publish">
                  Terbitkan artikel
                </button>
              )}
              {record.id && <Link href={`/admin/posts/${record.id}/preview`}>Preview</Link>}
            </div>
            <small>Ctrl+S / ⌘S untuk menyimpan sesuai status yang dipilih.</small>
          </section>
          <section className="adminEditorPanel">
            <h2>Gambar cover</h2>
            {coverPreview && (
              <Image
                className="adminCoverPreview"
                src={cover}
                alt={coverAlt}
                width={400}
                height={240}
                unoptimized
              />
            )}
            {options.canUpload && (
              <MediaPicker
                label="Pilih gambar cover"
                onSelect={(media) => {
                  setCover(`/api/media/${media.id}`)
                  setCoverAlt(media.alt)
                  markDirty()
                }}
              />
            )}
            <label>
              URL gambar cover
              <input
                name="featuredImage"
                value={cover}
                onChange={(event) => setCover(event.target.value)}
              />
            </label>
            <label>
              Teks alternatif cover
              <input
                name="featuredImageAlt"
                maxLength={250}
                value={coverAlt}
                onChange={(event) => setCoverAlt(event.target.value)}
              />
            </label>
            {cover && (
              <button
                type="button"
                onClick={() => {
                  setCover('')
                  setCoverAlt('')
                  markDirty()
                }}
              >
                Hapus cover
              </button>
            )}
          </section>
          <section className="adminEditorPanel">
            <h2>Taksonomi</h2>
            <div style={{ marginBottom: '1rem' }}>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.35rem',
                }}
              >
                Kategori
              </span>
              <div
                style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid var(--admin-border, #e2e8f0)',
                  borderRadius: '0.375rem',
                  padding: '0.5rem',
                  background: 'var(--admin-surface, #fff)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.375rem',
                }}
              >
                {categoriesList.map((category) => {
                  const checked = fields.categories.includes(category.id)
                  return (
                    <label
                      key={category.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        margin: 0,
                        paddingInlineStart: `${category.depth * 1.25}rem`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...fields.categories, category.id]
                            : fields.categories.filter((id) => id !== category.id)
                          update('categories', next)
                          markDirty()
                        }}
                      />
                      <span>{category.name}</span>
                    </label>
                  )
                })}
                {categoriesList.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted, #64748b)', margin: 0 }}>
                    Belum ada kategori.
                  </p>
                )}
              </div>
              {/* Hidden inputs to pass all selected categories to FormData */}
              {fields.categories.map((catId) => (
                <input key={catId} type="hidden" name="categories" value={catId} />
              ))}
              {fields.categories.length === 0 && (
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--muted, #64748b)',
                    margin: '0.25rem 0 0',
                  }}
                >
                  * Otomatis disetel ke &quot;{options.defaultCategoryName || 'kategori baku'}&quot;
                  jika tidak ada yang dipilih.
                </p>
              )}

              {options.categoryNotice && (
                <p role="note" aria-label="Pemberitahuan kategori baku">
                  {options.categoryNotice}
                </p>
              )}
              {options.canManageCategories && (
                <div style={{ marginTop: '0.5rem' }}>
                  {!showAddCategory ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCategory(true)
                        setCatError('')
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary, #0284c7)',
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      + Tambah Kategori Baru
                    </button>
                  ) : (
                    <div
                      style={{
                        marginTop: '0.35rem',
                        padding: '0.5rem',
                        border: '1px solid var(--admin-border, #e2e8f0)',
                        borderRadius: '0.375rem',
                        background: 'var(--subtle, #f8fafc)',
                      }}
                    >
                      <input
                        type="text"
                        aria-label="Nama kategori baru"
                        placeholder="Nama kategori baru"
                        value={newCatName}
                        disabled={isAddingCat}
                        onChange={(e) => setNewCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleQuickAddCategory()
                          }
                        }}
                        style={{
                          width: '100%',
                          fontSize: '0.8125rem',
                          padding: '0.375rem 0.5rem',
                          marginBottom: '0.375rem',
                          border: '1px solid var(--admin-border, #cbd5e1)',
                          borderRadius: '0.25rem',
                        }}
                      />
                      <label>
                        Induk kategori baru
                        <select
                          aria-label="Induk kategori baru"
                          value={newCatParent}
                          onChange={(event) => setNewCatParent(event.target.value)}
                          disabled={isAddingCat}
                        >
                          <option value="">— Tanpa induk —</option>
                          {categoriesList.map((category) => (
                            <option key={category.id} value={category.id}>
                              {'— '.repeat(category.depth)}
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {catError && (
                        <p
                          role="alert"
                          style={{
                            color: 'var(--danger, #ef4444)',
                            fontSize: '0.75rem',
                            margin: '0 0 0.375rem',
                          }}
                        >
                          {catError}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button
                          type="button"
                          disabled={isAddingCat || !newCatName.trim()}
                          onClick={handleQuickAddCategory}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            background: 'var(--primary, #0284c7)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {isAddingCat ? 'Menyimpan...' : 'Tambah Kategori'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddCategory(false)
                            setNewCatName('')
                            setCatError('')
                          }}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            background: 'transparent',
                            border: '1px solid var(--admin-border, #cbd5e1)',
                            cursor: 'pointer',
                          }}
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <label>
              Tag (pisahkan dengan koma)
              <input
                name="tags"
                maxLength={1000}
                value={fields.tags}
                onChange={(event) => update('tags', event.target.value)}
              />
            </label>
          </section>
        </aside>
      </div>
    </form>
  )
}
