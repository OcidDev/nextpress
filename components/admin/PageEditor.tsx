'use client'

import { useState } from 'react'
import { ContentSeoPanel } from './ContentSeoPanel'
import type { ContentSeoProvider } from '@/lib/plugins/content-seo'
import Link from 'next/link'
import { savePage } from '@/server/actions/content'
import { HtmlEditor } from './HtmlEditor'
import { useEditorSave } from './useEditorSave'
import { editorSaveShortcut } from './editorSaveShortcut'
import { slugify } from '@/lib/utils'
import type { PageRow } from '@/lib/db/schema'
import type { PageAttributeChoices } from '@/lib/db/queries/page-attributes'

function initialFields(page?: PageRow) {
  return {
    title: page?.title || '',
    slug: page?.slug || '',
    parentId: page?.parentId || '',
    pageTemplate: page?.pageTemplate || 'default',
    menuOrder: String(page?.menuOrder ?? 0),
  }
}

export function PageEditor({
  page,
  saved = false,
  attributes,
  contentSeo,
  canUpload,
}: {
  page?: PageRow
  saved?: boolean
  attributes: PageAttributeChoices
  contentSeo: ContentSeoProvider | null
  canUpload: boolean
}) {
  const [fields, setFields] = useState(() => initialFields(page))
  const [slugManual, setSlugManual] = useState(!!page?.id)
  const [initialContent] = useState(page?.content || '')
  const { form, state, action, pending, navigating, dirty, markDirty, onSubmit, record } =
    useEditorSave({
      initial: {
        id: page?.id || '',
        slug: page?.slug || '',
        version: page?.updatedAt.toISOString() || '',
      },
      kind: 'pages',
      save: savePage,
      initialSuccess: saved ? 'Halaman tersimpan.' : undefined,
      onSaved(saved, submitted) {
        setFields((current) => ({
          ...current,
          ...(current.slug === submitted.get('slug') ? { slug: saved.slug } : {}),
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
                maxLength={160}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={fields.slug}
                onChange={(event) => update('slug', event.target.value)}
              />
            </label>
            <small>URL: /{fields.slug || '…'}</small>
          </section>
          <HtmlEditor canUpload={canUpload} content={initialContent} onChange={markDirty} />
          <ContentSeoPanel
            provider={contentSeo}
            initial={page?.seo}
            title={fields.title}
            canUpload={canUpload}
            onChange={markDirty}
          />
        </div>
        <aside className="adminEditorAside" aria-label="Pengaturan halaman">
          <section className="adminEditorPanel">
            <h2>Publikasi</h2>
            <p>Halaman yang disimpan langsung tersedia untuk pembaca.</p>
            <p className="adminEditorSaveState" aria-live="polite">
              {pending
                ? 'Menyimpan perubahan…'
                : dirty
                  ? 'Ada perubahan yang belum disimpan.'
                  : 'Siap diedit.'}
            </p>
            {state.error && <p role="alert">{state.error}</p>}
            {state.success && <p role="status">{state.success}</p>}
            <button className="button" disabled={pending}>
              {pending ? 'Menyimpan…' : 'Simpan halaman'}
            </button>
            <small>Ctrl+S / ⌘S untuk menyimpan halaman.</small>
            {record.id && (
              <Link href={`/${record.slug}`} target="_blank" rel="noopener noreferrer">
                Lihat halaman
              </Link>
            )}
          </section>
          <section className="adminEditorPanel" aria-labelledby="page-attributes-heading">
            <h2 id="page-attributes-heading">Atribut Laman</h2>
            <label>
              Induk
              <select
                name="parentId"
                value={fields.parentId}
                onChange={(event) => update('parentId', event.target.value)}
              >
                <option value="">(tanpa induk)</option>
                {attributes.parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Templat
              <select
                name="pageTemplate"
                value={fields.pageTemplate}
                onChange={(event) => update('pageTemplate', event.target.value)}
              >
                <option value="default">Templat bawaan</option>
                {[...new Set(attributes.templates.map((template) => template.source))].map(
                  (source) => (
                    <optgroup key={source} label={source}>
                      {attributes.templates
                        .filter((template) => template.source === source)
                        .map((template) => (
                          <option key={template.value} value={template.value}>
                            {template.label}
                          </option>
                        ))}
                    </optgroup>
                  ),
                )}
                {fields.pageTemplate !== 'default' &&
                  !attributes.templates.some(
                    (template) => template.value === fields.pageTemplate,
                  ) && (
                    <option value={fields.pageTemplate}>Templat tersimpan (tidak tersedia)</option>
                  )}
              </select>
            </label>
            {fields.pageTemplate !== 'default' &&
            !attributes.templates.some((template) => template.value === fields.pageTemplate) ? (
              <small>
                Templat tersimpan tidak tersedia pada tema/plugin aktif. Laman memakai templat
                bawaan sampai templat tersebut tersedia kembali atau Anda memilih penggantinya.
              </small>
            ) : (
              <small>Pilihan templat disediakan oleh tema dan plugin aktif.</small>
            )}
            <label>
              Urutan
              <input
                name="menuOrder"
                type="number"
                step="1"
                min="-2147483648"
                max="2147483647"
                required
                value={fields.menuOrder}
                onChange={(event) => update('menuOrder', event.target.value)}
              />
            </label>
            <small>
              Angka lebih kecil ditampilkan lebih dahulu dalam daftar yang diurutkan menurut urutan
              laman.
            </small>
          </section>
        </aside>
      </div>
    </form>
  )
}
