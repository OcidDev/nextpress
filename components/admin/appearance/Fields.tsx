'use client'

import { useId, useState } from 'react'
import {
  createSection,
  createWidget,
  sectionLabels,
  sectionTypes,
  widgetLabels,
  widgetTypes,
  type Appearance,
  type Section,
  type Widget,
} from '@/lib/content/appearance'
import { MediaPicker } from '../MediaPicker'
import { SortableItems } from './SortableItems'
import type { PluginChoice } from '@/lib/plugins/manifest'
import { socialPlatforms } from '@/lib/content/settings'

export type AppearanceChoices = {
  posts: { id: string; title: string; slug: string }[]
  pages: { id: string; title: string; slug: string }[]
  authors: { id: string; name: string }[]
  categories: { id: string; slug: string; name: string; permalink?: string }[]
  plugins: PluginChoice[]
}
type LinkItem = { label: string; href: string }

export function TextField({
  label,
  value,
  onChange,
  maxLength = 160,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
  placeholder?: string
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
export function TextareaField({
  label,
  value,
  onChange,
  maxLength = 10000,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
}) {
  return (
    <label>
      {label}
      <textarea
        aria-label={label}
        rows={4}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
export function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="appearanceCheckbox">
      <input
        aria-label={label}
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  max = 20,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  max?: number
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.max(1, Math.min(max, Number(event.target.value) || 1)))}
      />
    </label>
  )
}
function ImageFields({
  image,
  alt,
  onChange,
  label = 'Gambar',
}: {
  image: string
  alt: string
  onChange: (image: string, alt: string) => void
  label?: string
}) {
  return (
    <div className="appearanceImageFields">
      <TextField
        label={`${label} (URL)`}
        value={image}
        maxLength={2000}
        onChange={(value) => onChange(value, alt)}
        placeholder="/api/media/… atau https://…"
      />
      <MediaPicker
        label={`Pilih ${label.toLowerCase()} dari media`}
        onSelect={(media) => onChange(`/api/media/${media.id}`, media.alt)}
      />
      <TextField
        label={`Teks alternatif ${label.toLowerCase()}`}
        value={alt}
        maxLength={250}
        onChange={(value) => onChange(image, value)}
      />
    </div>
  )
}

function PluginReferenceFields({
  pluginId,
  widgetId,
  choices,
  onChange,
}: {
  pluginId: string
  widgetId: string
  choices: AppearanceChoices
  onChange: (pluginId: string, widgetId: string) => void
}) {
  const selected = choices.plugins.find((plugin) => plugin.id === pluginId)
  return (
    <>
      <SelectField
        label="Plugin"
        value={pluginId}
        options={[
          { value: '', label: 'Pilih plugin…' },
          ...choices.plugins.map((plugin) => ({
            value: plugin.id,
            label: `${plugin.name}${plugin.enabled ? '' : ' (nonaktif)'}`,
          })),
          ...(pluginId && !selected
            ? [{ value: pluginId, label: `Plugin tidak tersedia (${pluginId})` }]
            : []),
        ]}
        onChange={(id) =>
          onChange(id, choices.plugins.find((plugin) => plugin.id === id)?.widgets[0]?.id || '')
        }
      />
      <SelectField
        label="Widget plugin"
        value={widgetId}
        options={[
          { value: '', label: 'Pilih widget…' },
          ...(selected?.widgets.map((widget) => ({ value: widget.id, label: widget.name })) || []),
          ...(widgetId && !selected?.widgets.some((widget) => widget.id === widgetId)
            ? [{ value: widgetId, label: `Widget tidak tersedia (${widgetId})` }]
            : []),
        ]}
        onChange={(id) => onChange(pluginId, id)}
      />
      {!choices.plugins.length && (
        <p className="appearanceHint">
          Pasang plugin melalui menu Plugin untuk menambahkan widget.
        </p>
      )}
      {selected && !selected.enabled && (
        <p className="appearanceHint">
          Plugin ini nonaktif. Widget tersedia di pratinjau admin dan tampil di situs setelah plugin
          diaktifkan.
        </p>
      )}
    </>
  )
}

function destinationOptions(choices: AppearanceChoices) {
  return [
    { value: '', label: 'Pilih halaman atau kategori…' },
    ...choices.pages.map((page) => ({ value: `/${page.slug}`, label: `Halaman: ${page.title}` })),
    ...choices.categories.map((category) => ({
      value: category.permalink || `/category/${category.slug}`,
      label: `Kategori: ${category.name}`,
    })),
  ]
}

export function LinksFields({
  links,
  onChange,
  choices,
  label = 'Tautan',
}: {
  links: LinkItem[]
  onChange: (links: LinkItem[]) => void
  choices: AppearanceChoices
  label?: string
}) {
  const id = useId()
  function move(index: number, direction: -1 | 1) {
    const next = [...links]
    ;[next[index], next[index + direction]] = [next[index + direction]!, next[index]!]
    onChange(next)
  }
  return (
    <div className="appearanceLinks">
      {links.map((link, index) => (
        <div className="appearanceLinkRow" key={`${id}-${index}`}>
          <TextField
            label={`${label} ${index + 1}: label`}
            value={link.label}
            maxLength={80}
            onChange={(value) =>
              onChange(links.map((item, i) => (i === index ? { ...item, label: value } : item)))
            }
          />
          <TextField
            label={`${label} ${index + 1}: URL`}
            value={link.href}
            maxLength={2000}
            onChange={(value) =>
              onChange(links.map((item, i) => (i === index ? { ...item, href: value } : item)))
            }
          />
          <label>
            Tujuan dari situs
            <select
              aria-label="Tujuan dari situs"
              value=""
              onChange={(event) => {
                const option = destinationOptions(choices).find(
                  (item) => item.value === event.target.value,
                )
                if (option?.value)
                  onChange(
                    links.map((item, i) =>
                      i === index
                        ? {
                            label: option.label.replace(/^(Halaman|Kategori): /, ''),
                            href: option.value,
                          }
                        : item,
                    ),
                  )
              }}
            >
              {destinationOptions(choices).map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="appearanceInlineActions">
            <button
              type="button"
              disabled={index === 0}
              aria-label={`Naikkan ${label.toLowerCase()} ${index + 1}`}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={index === links.length - 1}
              aria-label={`Turunkan ${label.toLowerCase()} ${index + 1}`}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Hapus ${label.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(links.filter((_, i) => i !== index))}
            >
              Hapus
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={links.length >= 20}
        onClick={() => onChange([...links, { label: 'Tautan baru', href: '/' }])}
      >
        Tambah {label.toLowerCase()}
      </button>
    </div>
  )
}

export function IdentityFields({
  site,
  onChange,
}: {
  site: Appearance['site']
  onChange: (site: Appearance['site']) => void
}) {
  return (
    <div className="adminForm">
      <TextField
        label="Nama situs"
        value={site.name}
        maxLength={100}
        onChange={(name) => onChange({ ...site, name })}
      />
      <TextareaField
        label="Deskripsi situs"
        value={site.description}
        maxLength={500}
        onChange={(description) => onChange({ ...site, description })}
      />
      <TextField
        label="Logo (URL)"
        value={site.logo}
        maxLength={2000}
        onChange={(logo) => onChange({ ...site, logo })}
      />
      <MediaPicker
        label="Pilih logo dari media"
        onSelect={(media) => onChange({ ...site, logo: `/api/media/${media.id}` })}
      />
      <p className="appearanceHint">
        Nama, deskripsi, dan logo rancangan mulai muncul di situs setelah diterapkan.
      </p>
    </div>
  )
}

export function StyleFields({
  config,
  onChange,
}: {
  config: Appearance
  onChange: (config: Appearance) => void
}) {
  return (
    <div className="adminForm">
      <SelectField
        label="Gaya tema"
        value={config.style.design}
        options={[
          { value: 'standard', label: 'Standar' },
          { value: 'reference', label: 'Referensi' },
        ]}
        onChange={(design) => onChange({ ...config, style: { ...config.style, design } })}
      />
      <SelectField
        label="Mode bawaan"
        value={config.site.defaultMode}
        options={[
          { value: 'system', label: 'Ikuti perangkat' },
          { value: 'light', label: 'Terang' },
          { value: 'dark', label: 'Gelap' },
        ]}
        onChange={(defaultMode) => onChange({ ...config, site: { ...config.site, defaultMode } })}
      />
      <SelectField
        label="Palet warna"
        value={config.site.defaultTheme}
        options={Array.from({ length: 11 }, (_, index) => ({
          value: String(index),
          label: `Palet ${index + 1}`,
        }))}
        onChange={(defaultTheme) => onChange({ ...config, site: { ...config.site, defaultTheme } })}
      />
      <SelectField
        label="Lebar konten"
        value={config.style.width}
        options={[
          { value: 'normal', label: 'Standar' },
          { value: 'wide', label: 'Lebar' },
        ]}
        onChange={(width) => onChange({ ...config, style: { ...config.style, width } })}
      />
      <SelectField
        label="Ukuran teks"
        value={config.style.fontSize}
        options={[
          { value: 'normal', label: 'Standar' },
          { value: 'large', label: 'Besar' },
        ]}
        onChange={(fontSize) => onChange({ ...config, style: { ...config.style, fontSize } })}
      />
      <p className="appearanceHint">
        Pembaca tetap dapat memilih mode dan palet sendiri jika kontrol tema ditampilkan.
      </p>
      <h3>Tindakan kartu artikel</h3>
      <ToggleField
        label="Tampilkan simpan bacaan pada kartu"
        value={config.cards.bookmarks}
        onChange={(bookmarks) => onChange({ ...config, cards: { ...config.cards, bookmarks } })}
      />
      <ToggleField
        label="Tampilkan jumlah kunjungan artikel"
        value={config.cards.showViews}
        onChange={(showViews) => onChange({ ...config, cards: { ...config.cards, showViews } })}
      />
      <ToggleField
        label="Tampilkan edit cepat untuk admin"
        value={config.cards.quickEdit}
        onChange={(quickEdit) => onChange({ ...config, cards: { ...config.cards, quickEdit } })}
      />
    </div>
  )
}

export function HeaderFields({
  header,
  onChange,
}: {
  header: Appearance['header']
  onChange: (header: Appearance['header']) => void
}) {
  return (
    <div className="adminForm">
      <SelectField
        label="Susunan header"
        value={header.layout}
        options={[
          { value: 'standard', label: 'Logo di kiri' },
          { value: 'centered', label: 'Logo di tengah' },
        ]}
        onChange={(layout) => onChange({ ...header, layout })}
      />
      <ToggleField
        label="Header tetap saat halaman digulir"
        value={header.sticky}
        onChange={(sticky) => onChange({ ...header, sticky })}
      />
      <SelectField
        label="Navigasi desktop bawaan"
        value={header.navigationDefault}
        options={[
          { value: 'expanded', label: 'Terbuka' },
          { value: 'rail', label: 'Ringkas' },
        ]}
        onChange={(navigationDefault) => onChange({ ...header, navigationDefault })}
      />
      <ToggleField
        label="Tampilkan pencarian"
        value={header.search}
        onChange={(search) => onChange({ ...header, search })}
      />
      <ToggleField
        label="Tampilkan kontrol tema"
        value={header.themeToggle}
        onChange={(themeToggle) => onChange({ ...header, themeToggle })}
      />
    </div>
  )
}

export function AnnouncementFields({
  announcement,
  onChange,
}: {
  announcement: Appearance['announcement']
  onChange: (announcement: Appearance['announcement']) => void
}) {
  return (
    <div className="adminForm">
      <h3>Informasi situs</h3>
      <ToggleField
        label="Tampilkan banner informasi"
        value={announcement.enabled}
        onChange={(enabled) => onChange({ ...announcement, enabled })}
      />
      <TextareaField
        label="Pesan informasi"
        value={announcement.text}
        maxLength={1000}
        onChange={(text) => onChange({ ...announcement, text })}
      />
      <TextField
        label="Label tombol informasi"
        value={announcement.buttonLabel}
        maxLength={80}
        onChange={(buttonLabel) => onChange({ ...announcement, buttonLabel })}
      />
      <TextField
        label="URL tombol informasi"
        value={announcement.buttonHref}
        maxLength={2000}
        onChange={(buttonHref) => onChange({ ...announcement, buttonHref })}
      />
    </div>
  )
}

function SectionFields({
  section,
  onChange,
  choices,
}: {
  section: Section
  onChange: (section: Section) => void
  choices: AppearanceChoices
}) {
  return (
    <>
      <TextField
        label="Judul bagian"
        value={section.title}
        onChange={(title) => onChange({ ...section, title })}
      />
      {section.type === 'hero' && (
        <>
          <TextareaField
            label="Teks pembuka"
            value={section.text}
            onChange={(text) => onChange({ ...section, text })}
          />
          <ImageFields
            image={section.image}
            alt={section.alt}
            onChange={(image, alt) => onChange({ ...section, image, alt })}
          />
          <TextField
            label="Label tombol"
            value={section.buttonLabel}
            maxLength={80}
            onChange={(buttonLabel) => onChange({ ...section, buttonLabel })}
          />
          <TextField
            label="Tujuan tombol"
            value={section.buttonHref}
            maxLength={2000}
            onChange={(buttonHref) => onChange({ ...section, buttonHref })}
          />
        </>
      )}
      {section.type === 'featured' && (
        <>
          <SelectField
            label="Artikel unggulan"
            value={section.postId}
            options={[
              { value: '', label: 'Pilih artikel…' },
              ...choices.posts.map((post) => ({ value: post.id, label: post.title })),
            ]}
            onChange={(postId) => onChange({ ...section, postId })}
          />
          <SelectField
            label="Presentasi unggulan"
            value={section.presentation}
            options={[
              { value: 'standard', label: 'Kartu standar' },
              { value: 'pinned', label: 'Disematkan seperti referensi' },
            ]}
            onChange={(presentation) => onChange({ ...section, presentation })}
          />
        </>
      )}
      {section.type === 'category' && (
        <SelectField
          label="Kategori artikel"
          value={section.categorySlug}
          options={[
            { value: '', label: 'Pilih kategori…' },
            ...choices.categories.map((category) => ({
              value: category.slug,
              label: category.name,
            })),
          ]}
          onChange={(categorySlug) => onChange({ ...section, categorySlug })}
        />
      )}
      {section.type === 'plugin' && (
        <PluginReferenceFields
          pluginId={section.pluginId}
          widgetId={section.widgetId}
          choices={choices}
          onChange={(pluginId, widgetId) => onChange({ ...section, pluginId, widgetId })}
        />
      )}
      {'layout' in section && (
        <SelectField
          label="Susunan kartu"
          value={section.layout}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'Daftar' },
          ]}
          onChange={(layout) => onChange({ ...section, layout })}
        />
      )}
      {'limit' in section && (
        <NumberField
          label="Jumlah artikel"
          value={section.limit}
          onChange={(limit) => onChange({ ...section, limit })}
        />
      )}
      {section.type === 'latest' && (
        <SelectField
          label="Navigasi daftar artikel"
          value={section.pagination}
          options={[
            { value: 'links', label: 'Tautan halaman' },
            { value: 'load-more', label: 'Muat postingan lainnya' },
          ]}
          onChange={(pagination) => onChange({ ...section, pagination })}
        />
      )}
    </>
  )
}

export function HomeFields({
  home,
  onChange,
  choices,
}: {
  home: Appearance['home']
  onChange: (home: Appearance['home']) => void
  choices: AppearanceChoices
}) {
  const [newType, setNewType] = useState<Section['type']>('hero')
  const hasLatest = home.sections.some((section) => section.type === 'latest')
  return (
    <div className="adminForm">
      <SelectField
        label="Isi beranda"
        value={home.mode}
        options={[
          { value: 'posts', label: 'Bagian dan daftar artikel' },
          { value: 'page', label: 'Halaman pilihan' },
        ]}
        onChange={(mode) => onChange({ ...home, mode })}
      />
      {home.mode === 'page' ? (
        <SelectField
          label="Halaman beranda"
          value={home.pageId}
          options={[
            { value: '', label: 'Pilih halaman…' },
            ...choices.pages.map((page) => ({ value: page.id, label: page.title })),
          ]}
          onChange={(pageId) => onChange({ ...home, pageId })}
        />
      ) : (
        <>
          <SelectField
            label="Kolom kartu mobile"
            value={String(home.mobileColumns)}
            options={[
              { value: '1', label: 'Satu kolom' },
              { value: '2', label: 'Dua kolom ringkas' },
            ]}
            onChange={(value) => onChange({ ...home, mobileColumns: value === '2' ? 2 : 1 })}
          />
          <p className="appearanceHint">
            Geser bagian atau gunakan panah untuk mengubah urutan. Daftar artikel utama hanya dapat
            ditambahkan satu kali.
          </p>
          <SortableItems
            items={home.sections}
            labelFor={(section) => sectionLabels[section.type]}
            onChange={(sections) => onChange({ ...home, sections })}
            canDuplicate={(section) => section.type !== 'latest' && home.sections.length < 20}
            renderFields={(section, update) => (
              <SectionFields section={section} onChange={update} choices={choices} />
            )}
          />
          <div className="appearanceAddRow">
            <label>
              Jenis bagian baru
              <select
                aria-label="Jenis bagian baru"
                value={newType}
                onChange={(event) => setNewType(event.target.value as Section['type'])}
              >
                {sectionTypes.map((type) => (
                  <option key={type} value={type} disabled={type === 'latest' && hasLatest}>
                    {sectionLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={home.sections.length >= 20 || (newType === 'latest' && hasLatest)}
              onClick={() =>
                onChange({ ...home, sections: [...home.sections, createSection(newType)] })
              }
            >
              Tambah bagian
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function ArticleFields({
  article,
  onChange,
}: {
  article: Appearance['article']
  onChange: (article: Appearance['article']) => void
}) {
  return (
    <div className="adminForm">
      <ToggleField
        label="Tampilkan sidebar artikel"
        value={article.sidebar}
        onChange={(sidebar) => onChange({ ...article, sidebar })}
      />
      <ToggleField
        label="Tampilkan penulis, tanggal, dan waktu baca"
        value={article.metadata}
        onChange={(metadata) => onChange({ ...article, metadata })}
      />
      <ToggleField
        label="Tampilkan gambar cover"
        value={article.cover}
        onChange={(cover) => onChange({ ...article, cover })}
      />
      <ToggleField
        label="Tampilkan komentar"
        value={article.comments}
        onChange={(comments) => onChange({ ...article, comments })}
      />
      <p className="appearanceHint">
        Izin komentar per artikel tetap berlaku bersama pengaturan tampilan ini.
      </p>
      <ToggleField
        label="Tampilkan daftar isi"
        value={article.toc}
        onChange={(toc) => onChange({ ...article, toc })}
      />
      <ToggleField
        label="Tampilkan tombol berbagi"
        value={article.share}
        onChange={(share) => onChange({ ...article, share })}
      />
      <ToggleField
        label="Tampilkan simpan bacaan pada artikel"
        value={article.bookmarks}
        onChange={(bookmarks) => onChange({ ...article, bookmarks })}
      />
    </div>
  )
}

function WidgetFields({
  widget,
  onChange,
  choices,
}: {
  widget: Widget
  onChange: (widget: Widget) => void
  choices: AppearanceChoices
}) {
  return (
    <>
      <TextField
        label="Judul widget"
        value={widget.title}
        onChange={(title) => onChange({ ...widget, title })}
      />
      <ToggleField
        label="Tempatkan di area sticky desktop"
        value={widget.sticky}
        onChange={(sticky) => onChange({ ...widget, sticky })}
      />
      {'text' in widget && (
        <TextareaField
          label="Isi teks"
          value={widget.text}
          onChange={(text) => onChange({ ...widget, text })}
        />
      )}
      {'limit' in widget && (
        <NumberField
          label="Jumlah item"
          max={widget.type === 'categories' ? 200 : 20}
          value={widget.limit}
          onChange={(limit) => onChange({ ...widget, limit })}
        />
      )}
      {widget.type === 'categories' && (
        <>
          <SelectField
            label="Urutan kategori"
            value={widget.sort}
            options={[
              { value: 'alphabetical', label: 'Alfabetis' },
              { value: 'count', label: 'Jumlah artikel' },
            ]}
            onChange={(sort) => onChange({ ...widget, sort })}
          />
          <NumberField
            label="Jumlah kategori awal"
            value={widget.initialCount}
            onChange={(initialCount) => onChange({ ...widget, initialCount })}
          />
          <ToggleField
            label="Tampilkan jumlah artikel kategori"
            value={widget.showCounts}
            onChange={(showCounts) => onChange({ ...widget, showCounts })}
          />
          <ToggleField
            label="Kategori dapat diperluas"
            value={widget.expandable}
            onChange={(expandable) => onChange({ ...widget, expandable })}
          />
        </>
      )}
      {widget.type === 'popular' && (
        <SelectField
          label="Rentang artikel populer"
          value={widget.range}
          options={[
            { value: '7days', label: 'Tujuh hari terakhir' },
            { value: 'alltime', label: 'Sepanjang waktu' },
          ]}
          onChange={(range) => onChange({ ...widget, range })}
        />
      )}
      {widget.type === 'author' && (
        <SelectField
          label="Profil penulis"
          value={widget.authorId}
          options={[
            { value: '', label: 'Pilih penulis…' },
            ...choices.authors.map((author) => ({ value: author.id, label: author.name })),
          ]}
          onChange={(authorId) => onChange({ ...widget, authorId })}
        />
      )}
      {widget.type === 'menu' && (
        <LinksFields
          links={widget.links}
          choices={choices}
          onChange={(links) => onChange({ ...widget, links })}
        />
      )}
      {widget.type === 'image' && (
        <ImageFields
          image={widget.image}
          alt={widget.alt}
          onChange={(image, alt) => onChange({ ...widget, image, alt })}
        />
      )}
      {widget.type === 'plugin' && (
        <PluginReferenceFields
          pluginId={widget.pluginId}
          widgetId={widget.widgetId}
          choices={choices}
          onChange={(pluginId, widgetId) => onChange({ ...widget, pluginId, widgetId })}
        />
      )}
      {widget.type === 'social' && (
        <p className="appearanceHint">Tautan sosial diatur melalui tab Menu.</p>
      )}
      {widget.type === 'about' && (
        <p className="appearanceHint">Isi kosong memakai deskripsi situs.</p>
      )}
    </>
  )
}

export function WidgetArea({
  widgets,
  onChange,
  choices,
  area,
}: {
  widgets: Widget[]
  onChange: (widgets: Widget[]) => void
  choices: AppearanceChoices
  area: string
}) {
  const [newType, setNewType] = useState<Widget['type']>('about')
  return (
    <div className="adminForm">
      <p className="appearanceHint">
        Susun widget {area.toLowerCase()}. Widget yang disembunyikan tetap tersimpan dalam
        rancangan.
      </p>
      <SortableItems
        items={widgets}
        onChange={onChange}
        labelFor={(widget) => widgetLabels[widget.type]}
        canDuplicate={() => widgets.length < 20}
        renderFields={(widget, update) => (
          <WidgetFields widget={widget} onChange={update} choices={choices} />
        )}
        emptyText={`Belum ada widget ${area.toLowerCase()}. Tambahkan widget untuk mengisi area ini.`}
      />
      <div className="appearanceAddRow">
        <label>
          Jenis widget baru
          <select
            aria-label="Jenis widget baru"
            value={newType}
            onChange={(event) => setNewType(event.target.value as Widget['type'])}
          >
            {widgetTypes.map((type) => (
              <option key={type} value={type}>
                {widgetLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={widgets.length >= 20}
          onClick={() => onChange([...widgets, createWidget(newType)])}
        >
          Tambah widget
        </button>
      </div>
    </div>
  )
}

export function FooterFields({
  config,
  onChange,
  choices,
}: {
  config: Appearance
  onChange: (config: Appearance) => void
  choices: AppearanceChoices
}) {
  return (
    <div className="adminForm">
      <h3>Identitas footer</h3>
      <TextField
        label="Teks pengantar footer"
        value={config.footer.intro}
        onChange={(intro) => onChange({ ...config, footer: { ...config.footer, intro } })}
      />
      <TextField
        label="Nama di footer"
        value={config.footer.name}
        maxLength={100}
        placeholder="Gunakan nama situs"
        onChange={(name) => onChange({ ...config, footer: { ...config.footer, name } })}
      />
      <TextareaField
        label="Deskripsi di footer"
        value={config.footer.description}
        maxLength={500}
        onChange={(description) =>
          onChange({ ...config, footer: { ...config.footer, description } })
        }
      />
      <TextField
        label="Logo footer (URL)"
        value={config.footer.logo}
        maxLength={2000}
        placeholder="Gunakan logo situs"
        onChange={(logo) => onChange({ ...config, footer: { ...config.footer, logo } })}
      />
      <MediaPicker
        label="Pilih logo footer dari media"
        onSelect={(media) =>
          onChange({ ...config, footer: { ...config.footer, logo: `/api/media/${media.id}` } })
        }
      />
      <SelectField
        label="Gaya sosial footer"
        value={config.footer.socialStyle}
        options={[
          { value: 'icons', label: 'Ikon' },
          { value: 'text', label: 'Teks dipisah slash' },
        ]}
        onChange={(socialStyle) =>
          onChange({ ...config, footer: { ...config.footer, socialStyle } })
        }
      />
      <ToggleField
        label="Tampilkan sosial footer"
        value={config.footer.showSocial}
        onChange={(showSocial) => onChange({ ...config, footer: { ...config.footer, showSocial } })}
      />
      <ToggleField
        label="Tampilkan statistik situs"
        value={config.footer.showStats}
        onChange={(showStats) => onChange({ ...config, footer: { ...config.footer, showStats } })}
      />
      <ToggleField
        label="Tampilkan gelombang footer"
        value={config.footer.showWaves}
        onChange={(showWaves) => onChange({ ...config, footer: { ...config.footer, showWaves } })}
      />
      <ToggleField
        label="Tampilkan tombol kembali ke atas"
        value={config.footer.showBackToTop}
        onChange={(showBackToTop) =>
          onChange({ ...config, footer: { ...config.footer, showBackToTop } })
        }
      />
      <TextField
        label="Teks copyright"
        value={config.footer.copyrightText}
        maxLength={500}
        placeholder="© {year} {site}"
        onChange={(copyrightText) =>
          onChange({ ...config, footer: { ...config.footer, copyrightText } })
        }
      />
      <h3>Kolom tautan footer</h3>
      <p className="appearanceHint">
        Maksimal tiga kolom tautan. Widget tambahan ditampilkan setelah kolom ini.
      </p>
      {config.site.footer.map((column, index) => (
        <fieldset className="appearanceGroup" key={index}>
          <legend>Kolom {index + 1}</legend>
          <ToggleField
            label={`Aktifkan kolom ${index + 1}`}
            value={column.enabled}
            onChange={(enabled) =>
              onChange({
                ...config,
                site: {
                  ...config.site,
                  footer: config.site.footer.map((item, i) =>
                    i === index ? { ...item, enabled } : item,
                  ),
                },
              })
            }
          />
          <TextField
            label="Judul kolom"
            value={column.title}
            maxLength={80}
            onChange={(title) =>
              onChange({
                ...config,
                site: {
                  ...config.site,
                  footer: config.site.footer.map((item, i) =>
                    i === index ? { ...item, title } : item,
                  ),
                },
              })
            }
          />
          <LinksFields
            links={column.links}
            choices={choices}
            onChange={(links) =>
              onChange({
                ...config,
                site: {
                  ...config.site,
                  footer: config.site.footer.map((item, i) =>
                    i === index ? { ...item, links } : item,
                  ),
                },
              })
            }
          />
          <div className="appearanceInlineActions">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                const footer = [...config.site.footer]
                ;[footer[index], footer[index - 1]] = [footer[index - 1]!, footer[index]!]
                onChange({ ...config, site: { ...config.site, footer } })
              }}
            >
              Naikkan kolom
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...config,
                  site: {
                    ...config.site,
                    footer: config.site.footer.filter((_, i) => i !== index),
                  },
                })
              }
            >
              Hapus kolom
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={config.site.footer.length >= 3}
        onClick={() =>
          onChange({
            ...config,
            site: {
              ...config.site,
              footer: [...config.site.footer, { title: 'Kolom baru', links: [], enabled: true }],
            },
          })
        }
      >
        Tambah kolom footer
      </button>
      <h3>Widget footer</h3>
      <WidgetArea
        widgets={config.footerWidgets}
        area="Footer"
        choices={choices}
        onChange={(footerWidgets) => onChange({ ...config, footerWidgets })}
      />
    </div>
  )
}

export function MenuFields({
  site,
  onChange,
  choices,
}: {
  site: Appearance['site']
  onChange: (site: Appearance['site']) => void
  choices: AppearanceChoices
}) {
  const navigation = site.navigation
  return (
    <div className="adminForm">
      <h3>Menu header dan mobile</h3>
      <p className="appearanceHint">
        Menu utama dipakai bersama pada header dan navigasi mobile. Kolom footer disusun pada tab
        Footer.
      </p>
      {navigation.map((item, index) => (
        <fieldset className="appearanceGroup" key={index}>
          <legend>Menu {index + 1}</legend>
          <TextField
            label="Label menu"
            value={item.label}
            maxLength={80}
            onChange={(label) =>
              onChange({
                ...site,
                navigation: navigation.map((value, i) =>
                  i === index ? { ...value, label } : value,
                ),
              })
            }
          />
          <ToggleField
            label="Gunakan submenu"
            value={Boolean(item.children)}
            onChange={(submenu) => {
              const base = { ...item }
              delete base.href
              delete base.children
              onChange({
                ...site,
                navigation: navigation.map((value, i) =>
                  i === index
                    ? submenu
                      ? { ...base, children: [{ label: 'Tautan baru', href: '/' }] }
                      : { ...base, href: '/' }
                    : value,
                ),
              })
            }}
          />
          {item.children ? (
            <LinksFields
              label="Submenu"
              links={item.children}
              choices={choices}
              onChange={(children) =>
                onChange({
                  ...site,
                  navigation: navigation.map((value, i) =>
                    i === index ? { ...value, children } : value,
                  ),
                })
              }
            />
          ) : (
            <>
              <TextField
                label="URL menu"
                value={item.href ?? ''}
                maxLength={2000}
                onChange={(href) =>
                  onChange({
                    ...site,
                    navigation: navigation.map((value, i) =>
                      i === index ? { ...value, href } : value,
                    ),
                  })
                }
              />
              <label>
                Tujuan dari situs
                <select
                  aria-label="Tujuan dari situs"
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      onChange({
                        ...site,
                        navigation: navigation.map((value, i) =>
                          i === index ? { ...value, href: event.target.value } : value,
                        ),
                      })
                  }}
                >
                  {destinationOptions(choices).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="appearanceInlineActions">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                const next = [...navigation]
                ;[next[index], next[index - 1]] = [next[index - 1]!, next[index]!]
                onChange({ ...site, navigation: next })
              }}
            >
              Naikkan menu
            </button>
            <button
              type="button"
              disabled={index === navigation.length - 1}
              onClick={() => {
                const next = [...navigation]
                ;[next[index], next[index + 1]] = [next[index + 1]!, next[index]!]
                onChange({ ...site, navigation: next })
              }}
            >
              Turunkan menu
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({ ...site, navigation: navigation.filter((_, i) => i !== index) })
              }
            >
              Hapus menu
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={navigation.length >= 20}
        onClick={() =>
          onChange({
            ...site,
            navigation: [...navigation, { label: 'Menu baru', href: '/', icon: 'FolderIcon' }],
          })
        }
      >
        Tambah menu
      </button>
      <h3>Tautan bawah navigasi kiri</h3>
      <LinksFields
        label="Tautan legal"
        links={site.secondaryNavigation}
        choices={choices}
        onChange={(secondaryNavigation) => onChange({ ...site, secondaryNavigation })}
      />
      <h3>Akun sosial</h3>
      {site.social.map((social, index) => (
        <fieldset className="appearanceGroup" key={index}>
          <legend>Sosial {index + 1}</legend>
          <TextField
            label="Label sosial"
            value={social.label}
            maxLength={80}
            onChange={(label) =>
              onChange({
                ...site,
                social: site.social.map((item, i) => (i === index ? { ...item, label } : item)),
              })
            }
          />
          <TextField
            label="URL sosial"
            value={social.href}
            maxLength={2000}
            onChange={(href) =>
              onChange({
                ...site,
                social: site.social.map((item, i) => (i === index ? { ...item, href } : item)),
              })
            }
          />
          <SelectField
            label="Ikon sosial"
            value={social.icon}
            options={[...socialPlatforms]}
            onChange={(icon) =>
              onChange({
                ...site,
                social: site.social.map((item, i) => (i === index ? { ...item, icon } : item)),
              })
            }
          />
          <button
            type="button"
            onClick={() => onChange({ ...site, social: site.social.filter((_, i) => i !== index) })}
          >
            Hapus sosial
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={site.social.length >= 10}
        onClick={() =>
          onChange({
            ...site,
            social: [
              ...site.social,
              { label: 'Instagram', href: 'https://instagram.com/', icon: 'InstagramIcon' },
            ],
          })
        }
      >
        Tambah sosial
      </button>
    </div>
  )
}
