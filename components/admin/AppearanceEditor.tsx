'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import {
  appearancePreset,
  type Appearance,
  type AppearanceActionState,
} from '@/lib/content/appearance'
import type { AppearanceEditorData } from '@/lib/db/queries/appearance'
import {
  applyAppearance,
  discardAppearance,
  restoreAppearance,
  saveAppearance,
} from '@/server/actions/appearance'
import {
  ArticleFields,
  AnnouncementFields,
  FooterFields,
  HeaderFields,
  HomeFields,
  IdentityFields,
  MenuFields,
  StyleFields,
  WidgetArea,
} from './appearance/Fields'
import { EyeIcon, SettingsIcon } from '@/components/ui/icons'

const tabs = [
  ['identity', 'Identitas'],
  ['style', 'Gaya'],
  ['header', 'Header'],
  ['home', 'Beranda'],
  ['article', 'Artikel'],
  ['sidebar', 'Sidebar'],
  ['footer', 'Footer'],
  ['menu', 'Menu'],
] as const
type Tab = (typeof tabs)[number][0]
type Operation = 'save' | 'apply' | 'discard' | 'restore'

export function AppearanceEditor({
  editor,
  standalone = false,
  isActive = true,
}: {
  editor: AppearanceEditorData
  standalone?: boolean
  isActive?: boolean
}) {
  const [config, setConfig] = useState(editor.draft.config)
  const [revision, setRevision] = useState(editor.draft.revision)
  const [savedJson, setSavedJson] = useState(JSON.stringify(editor.draft.config))
  const [tab, setTab] = useState<Tab>('identity')
  const [mobileView, setMobileView] = useState<'settings' | 'preview'>('settings')
  const [previewWidth, setPreviewWidth] = useState(1440)
  const [previewAvailableWidth, setPreviewAvailableWidth] = useState(500)
  const [previewNonce, setPreviewNonce] = useState(0)
  const [operation, setOperation] = useState<Operation>('save')
  const previewContainer = useRef<HTMLDivElement>(null)
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([])
  const expectedReset = useRef(false)
  const allowLeave = useRef(false)
  const json = JSON.stringify(config)
  const dirty = json !== savedJson
  const pendingApply = savedJson !== JSON.stringify(editor.active.config)

  const [saveState, saveAction, saving] = useActionState(
    async (previous: AppearanceActionState, data: FormData): Promise<AppearanceActionState> => {
      const result = await saveAppearance(previous, data)
      if (!result.error && result.revision !== undefined) {
        setRevision(result.revision)
        setSavedJson(String(data.get('config')))
        setPreviewNonce((value) => value + 1)
      }
      return result
    },
    {},
  )
  const [applyState, applyAction, applying] = useActionState(
    async (previous: AppearanceActionState, data: FormData): Promise<AppearanceActionState> => {
      const result = await applyAppearance(previous, data)
      if (!result.error && result.revision !== undefined) {
        setRevision(result.revision)
        setPreviewNonce((value) => value + 1)
      }
      return result
    },
    {},
  )
  const [discardState, discardAction, discarding] = useActionState(
    async (previous: AppearanceActionState, data: FormData): Promise<AppearanceActionState> => {
      const result = await discardAppearance(previous, data)
      if (result?.error) {
        expectedReset.current = false
        allowLeave.current = false
      }
      return result ?? {}
    },
    {},
  )
  const [restoreState, restoreAction, restoring] = useActionState(
    async (previous: AppearanceActionState, data: FormData): Promise<AppearanceActionState> => {
      const result = await restoreAppearance(previous, data)
      if (result?.error) {
        expectedReset.current = false
        allowLeave.current = false
      }
      return result ?? {}
    },
    {},
  )
  const busy = saving || applying || discarding || restoring
  const state = {
    save: saveState,
    apply: applyState,
    discard: discardState,
    restore: restoreState,
  }[operation]

  useEffect(() => {
    if (expectedReset.current && editor.draft.revision !== revision) {
      setConfig(editor.draft.config)
      setSavedJson(JSON.stringify(editor.draft.config))
      setRevision(editor.draft.revision)
      setPreviewNonce((value) => value + 1)
      expectedReset.current = false
      allowLeave.current = false
    } else if (!dirty && editor.draft.revision === revision) {
      // The server sanitizes HTML. Adopt that result after the save succeeds.
      setConfig(editor.draft.config)
      setSavedJson(JSON.stringify(editor.draft.config))
    }
  }, [editor.draft, revision, dirty])

  useEffect(() => {
    const node = previewContainer.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      setPreviewAvailableWidth(entries[0]?.contentRect.width || 500)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [mobileView])

  useEffect(() => {
    if (!dirty) return
    function warn(event: BeforeUnloadEvent) {
      if (allowLeave.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    function warnLink(event: MouseEvent) {
      if (
        allowLeave.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const link = event.target instanceof Element ? event.target.closest('a') : null
      if (
        !link ||
        link.target === '_blank' ||
        !link.href ||
        link.getAttribute('href')?.startsWith('#')
      )
        return
      if (!window.confirm('Ada perubahan tampilan yang belum disimpan. Tinggalkan halaman ini?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', warnLink, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', warnLink, true)
    }
  }, [dirty])

  function choosePreset(preset: Appearance['preset']) {
    if (
      !window.confirm(
        'Preset akan mengganti susunan bagian, widget, dan gaya rancangan. Identitas dan menu tetap dipakai. Lanjutkan?',
      )
    )
      return
    setConfig(appearancePreset(preset, config))
  }

  function fieldContent() {
    switch (tab) {
      case 'identity':
        return (
          <IdentityFields site={config.site} onChange={(site) => setConfig({ ...config, site })} />
        )
      case 'style':
        return <StyleFields config={config} onChange={setConfig} />
      case 'header':
        return (
          <>
            <HeaderFields
              header={config.header}
              onChange={(header) => setConfig({ ...config, header })}
            />
            <AnnouncementFields
              announcement={config.announcement}
              onChange={(announcement) => setConfig({ ...config, announcement })}
            />
          </>
        )
      case 'home':
        return (
          <HomeFields
            home={config.home}
            choices={editor.choices}
            onChange={(home) => setConfig({ ...config, home })}
          />
        )
      case 'article':
        return (
          <ArticleFields
            article={config.article}
            onChange={(article) => setConfig({ ...config, article })}
          />
        )
      case 'sidebar':
        return (
          <WidgetArea
            area="Sidebar"
            widgets={config.sidebar}
            choices={editor.choices}
            onChange={(sidebar) => setConfig({ ...config, sidebar })}
          />
        )
      case 'footer':
        return <FooterFields config={config} onChange={setConfig} choices={editor.choices} />
      case 'menu':
        return (
          <MenuFields
            site={config.site}
            choices={editor.choices}
            onChange={(site) => setConfig({ ...config, site })}
          />
        )
    }
  }

  const referenceWarnings = [
    ...(config.home.mode === 'page' &&
    (!config.home.pageId || !editor.choices.pages.some((page) => page.id === config.home.pageId))
      ? ['Pilih halaman beranda yang tersedia sebelum menerapkan.']
      : []),
    ...config.home.sections
      .filter((section) => section.enabled)
      .flatMap((section) => {
        if (
          section.type === 'featured' &&
          !editor.choices.posts.some((post) => post.id === section.postId)
        )
          return ['Bagian unggulan membutuhkan artikel yang sudah terbit.']
        if (
          section.type === 'category' &&
          !editor.choices.categories.some((category) => category.slug === section.categorySlug)
        )
          return ['Bagian kategori membutuhkan kategori yang tersedia.']
        if (
          section.type === 'plugin' &&
          !editor.choices.plugins.some(
            (plugin) =>
              plugin.id === section.pluginId &&
              plugin.widgets.some((widget) => widget.id === section.widgetId),
          )
        )
          return ['Bagian plugin membutuhkan widget dari plugin yang masih terpasang.']
        return []
      }),
    ...[...config.sidebar, ...config.footerWidgets]
      .filter((widget) => widget.enabled)
      .flatMap((widget) => {
        if (
          widget.type === 'author' &&
          !editor.choices.authors.some((author) => author.id === widget.authorId)
        )
          return ['Widget profil penulis membutuhkan penulis yang tersedia.']
        if (widget.type === 'image' && !widget.image)
          return ['Widget gambar yang aktif membutuhkan gambar.']
        if (
          widget.type === 'plugin' &&
          !editor.choices.plugins.some(
            (plugin) =>
              plugin.id === widget.pluginId &&
              plugin.widgets.some((item) => item.id === widget.widgetId),
          )
        )
          return ['Widget plugin membutuhkan plugin dan widget yang masih terpasang.']
        return []
      }),
  ]
  const previewUrl = `/admin/appearance/preview?revision=${revision}&refresh=${previewNonce}`
  const previewScale = Math.min(1, Math.max(0.1, previewAvailableWidth / previewWidth))
  const serverChanged = editor.draft.revision !== revision && !busy

  return (
    <>
      {!standalone && (
        <div className="adminPageHeader">
          <div>
            <p className="adminEyebrow">TEMA SITUS</p>
            <h1>Tampilan</h1>
            <p className="adminPageIntro">
              Susun tampilan, simpan rancangan, lalu terapkan saat siap.
            </p>
          </div>
          <Link className="button secondary" href="/" target="_blank">
            <EyeIcon aria-hidden="true" /> Lihat situs
          </Link>
        </div>
      )}
      <section className="appearanceToolbar" aria-label="Penyimpanan tampilan">
        <div>
          <span className={`appearanceState${dirty ? ' isDirty' : ''}`}>
            {dirty
              ? 'Perubahan belum disimpan'
              : pendingApply
                ? 'Rancangan siap dipreview'
                : 'Tampilan sesuai situs aktif'}
          </span>
          <small>
            Versi rancangan {revision} · versi aktif {editor.active.revision}
          </small>
        </div>
        <div className="appearanceSaveActions">
          <form action={saveAction} onSubmit={() => setOperation('save')}>
            <input type="hidden" name="config" value={json} />
            <input type="hidden" name="revision" value={revision} />
            <button type="submit" disabled={busy || !dirty}>
              {saving ? 'Menyimpan…' : 'Simpan rancangan'}
            </button>
          </form>
          <form action={applyAction} onSubmit={() => setOperation('apply')}>
            <input type="hidden" name="revision" value={revision} />
            <button
              type="submit"
              className="button"
              disabled={busy || dirty || !pendingApply || !isActive}
            >
              {applying ? 'Menerapkan…' : 'Terapkan ke situs'}
            </button>
          </form>
        </div>
      </section>
      {dirty && (
        <p className="appearanceUnsaved" role="status">
          Perubahan saat ini belum terlihat di pratinjau. Simpan rancangan untuk memperbarui
          pratinjau; situs publik berubah setelah diterapkan.
        </p>
      )}
      {busy && (
        <p role="status">
          {saving
            ? 'Menyimpan rancangan…'
            : applying
              ? 'Menerapkan tampilan…'
              : 'Memperbarui rancangan…'}
        </p>
      )}
      {state.error && (
        <div className="appearanceNotice" role="alert">
          <p>{state.error}</p>
          {state.error.includes('tab lain') && (
            <button
              type="button"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    'Muat versi terbaru dan buang perubahan yang belum disimpan di tab ini?',
                  )
                ) {
                  allowLeave.current = true
                  window.location.reload()
                }
              }}
            >
              Muat versi terbaru
            </button>
          )}
        </div>
      )}
      {!busy && state.success && (
        <p className="appearanceNotice success" role="status">
          {state.success}
        </p>
      )}
      {serverChanged && !state.error && (
        <p className="appearanceNotice">
          Versi tersimpan sudah berubah. Muat ulang halaman sebelum menyimpan perubahan berikutnya.
        </p>
      )}
      {referenceWarnings.length > 0 && (
        <div className="appearanceNotice">
          <strong>Lengkapi referensi rancangan</strong>
          <ul>
            {[...new Set(referenceWarnings)].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="appearanceMobileTabs" aria-label="Mode penyuntingan">
        <button
          type="button"
          aria-pressed={mobileView === 'settings'}
          onClick={() => setMobileView('settings')}
        >
          Pengaturan
        </button>
        <button
          type="button"
          aria-pressed={mobileView === 'preview'}
          onClick={() => setMobileView('preview')}
        >
          Pratinjau
        </button>
      </div>
      <div className={`appearanceWorkspace appearanceView-${mobileView}`}>
        <section className="appearanceControls" aria-label="Pengaturan tampilan">
          {standalone && (
            <>
              <h2>Desain</h2>
              <p>Sesuaikan tampilan situs Anda.</p>
              {!isActive && (
                <p>Tema belum aktif. Rancangan tetap privat sampai Anda mengaktifkan tema.</p>
              )}
            </>
          )}
          <details className="appearancePresets">
            <summary>
              <SettingsIcon aria-hidden="true" /> Pilih preset susunan
            </summary>
            <div>
              <p>Preset mengganti susunan rancangan. Terapkan untuk mengubah situs.</p>
              <div className="appearancePresetButtons">
                {(
                  [
                    ['blog', 'Blog standar'],
                    ['magazine', 'Majalah'],
                    ['minimal', 'Minimal'],
                    ['reference', 'Referensi'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    disabled={busy}
                    aria-pressed={config.preset === value}
                    onClick={() => choosePreset(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </details>
          <div className="appearanceTabs" role="tablist" aria-label="Bagian tampilan">
            {tabs.map(([id, label], index) => (
              <button
                type="button"
                role="tab"
                id={`appearance-tab-${id}`}
                aria-controls={`appearance-fields-${id}`}
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                key={id}
                ref={(element) => {
                  tabButtons.current[index] = element
                }}
                onClick={() => setTab(id)}
                onKeyDown={(event) => {
                  let next: number | undefined
                  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
                  if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
                  if (event.key === 'Home') next = 0
                  if (event.key === 'End') next = tabs.length - 1
                  if (next !== undefined) {
                    event.preventDefault()
                    setTab(tabs[next]![0])
                    tabButtons.current[next]?.focus()
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="appearanceFields"
            role="tabpanel"
            id={`appearance-fields-${tab}`}
            aria-labelledby={`appearance-tab-${tab}`}
            tabIndex={0}
          >
            <fieldset disabled={busy}>
              <legend className="srOnly">{tabs.find(([id]) => id === tab)?.[1]}</legend>
              {fieldContent()}
            </fieldset>
          </div>
          <details className="appearanceRecovery">
            <summary>Rancangan dan pemulihan</summary>
            <div>
              <p>
                Buang rancangan untuk kembali ke tampilan aktif. Pemulihan mengembalikan tampilan
                aktif sebelumnya dan langsung mengubah situs.
              </p>
              <form
                action={discardAction}
                onSubmit={(event) => {
                  if (
                    !window.confirm(
                      'Buang rancangan serta perubahan lokal dan kembali ke tampilan situs aktif?',
                    )
                  ) {
                    event.preventDefault()
                    return
                  }
                  expectedReset.current = true
                  allowLeave.current = true
                  setOperation('discard')
                }}
              >
                <input type="hidden" name="revision" value={revision} />
                <button type="submit" disabled={busy || (!dirty && !pendingApply)}>
                  Buang rancangan
                </button>
              </form>
              <form
                action={restoreAction}
                onSubmit={(event) => {
                  if (
                    !window.confirm(
                      'Pulihkan tampilan aktif sebelumnya? Rancangan saat ini akan diganti dan situs langsung diperbarui.',
                    )
                  ) {
                    event.preventDefault()
                    return
                  }
                  expectedReset.current = true
                  allowLeave.current = true
                  setOperation('restore')
                }}
              >
                <input type="hidden" name="revision" value={revision} />
                <button type="submit" disabled={busy || !editor.hasPrevious || !isActive}>
                  Pulihkan tampilan sebelumnya
                </button>
              </form>
            </div>
          </details>
        </section>
        <section className="appearancePreview" aria-label="Pratinjau rancangan">
          <div className="appearancePreviewHeading">
            <div>
              <h2>Pratinjau rancangan tersimpan</h2>
              <p>Ukuran layar {previewWidth} piksel.</p>
            </div>
            <Link href={previewUrl} target="_blank" className="dashboardTextLink">
              Buka pratinjau <EyeIcon aria-hidden="true" />
            </Link>
          </div>
          <div className="appearanceDevices" aria-label="Ukuran pratinjau">
            {[
              [1440, 'Desktop'],
              [768, 'Tablet'],
              [390, 'Mobile'],
            ].map(([width, label]) => (
              <button
                type="button"
                key={width}
                aria-pressed={previewWidth === width}
                onClick={() => setPreviewWidth(Number(width))}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="appearancePreviewViewport" ref={previewContainer}>
            <div style={{ height: 900 * previewScale, overflow: 'hidden' }}>
              <iframe
                key={`${revision}-${previewNonce}`}
                src={previewUrl}
                title="Pratinjau rancangan situs"
                width={previewWidth}
                height={900}
                style={{
                  width: previewWidth,
                  height: 900,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  border: 0,
                  display: 'block',
                }}
              />
            </div>
          </div>
          <p className="appearanceHint">
            Pratinjau dilindungi login admin. Rancangan yang belum diterapkan tidak tampil untuk
            pembaca.
          </p>
        </section>
      </div>
    </>
  )
}
