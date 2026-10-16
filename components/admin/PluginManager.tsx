'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  pluginSlots,
  pluginSlotLabels,
  type PluginActionState,
  type PluginConfig,
  type PluginManifest,
} from '@/lib/plugins/manifest'
import type { InstalledPlugin } from '@/lib/db/queries/plugins'
import {
  installPlugin,
  replacePlugin,
  savePluginConfig,
  togglePlugin,
  uninstallPlugin,
} from '@/server/actions/plugins'
import { FolderIcon, PlusIcon, SettingsIcon } from '@/components/ui/icons'
import styles from './PluginManager.module.css'

type Operation = 'toggle' | 'config' | 'replace' | 'uninstall'
const maxZipSize = 2 * 1024 * 1024

function MutationMessage({ state, pending }: { state: PluginActionState; pending: boolean }) {
  return (
    <div className={styles.messages} aria-live="polite">
      {pending && <p role="status">Memproses perubahan plugin…</p>}
      {!pending && state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {!pending && state.success && (
        <p role="status" className={styles.success}>
          {state.success}
        </p>
      )}
    </div>
  )
}

function ZipInput({
  inputRef,
  error,
  onError,
  id,
  label,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  error: string
  onError: (error: string) => void
  id: string
  label: string
}) {
  return (
    <div className={styles.zipInput}>
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        type="file"
        id={id}
        name="file"
        accept=".zip,application/zip"
        required
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const file = event.target.files?.[0]
          onError(
            file && file.size > maxZipSize
              ? 'Ukuran ZIP maksimal 2 MB.'
              : file && !file.name.toLowerCase().endsWith('.zip')
                ? 'Pilih berkas dengan ekstensi .zip.'
                : '',
          )
        }}
      />
      <small id={`${id}-hint`}>Paket ZIP, maksimal 2 MB.</small>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}

function UploadPlugin() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState('')
  const [state, action, pending] = useActionState(
    async (previous: PluginActionState, data: FormData) => {
      const result = await installPlugin(previous, data)
      if (result.success) {
        if (input.current) input.current.value = ''
        setFileError('')
        router.refresh()
      }
      return result
    },
    {},
  )
  return (
    <section className={styles.upload} aria-labelledby="plugin-upload-heading">
      <div>
        <span className={styles.uploadIcon}>
          <FolderIcon aria-hidden="true" />
        </span>
        <h2 id="plugin-upload-heading">Unggah plugin</h2>
        <p>
          Pasang paket widget atau templat laman khusus NextPress. Setelah terpasang, plugin dapat
          diaktifkan dari daftar di bawah.
        </p>
      </div>
      <form
        action={action}
        onReset={(event) => event.preventDefault()}
        onSubmit={(event) => {
          const file = input.current?.files?.[0]
          if (fileError || (file && file.size > maxZipSize)) {
            event.preventDefault()
            setFileError('Periksa berkas ZIP. Ukuran maksimal 2 MB.')
          }
        }}
      >
        <fieldset disabled={pending}>
          <ZipInput
            inputRef={input}
            id="plugin-install-file"
            label="Berkas ZIP plugin"
            error={fileError}
            onError={setFileError}
          />
          <button type="submit" className="button" disabled={pending || Boolean(fileError)}>
            {pending ? 'Memasang…' : 'Pasang plugin'}
          </button>
        </fieldset>
        <MutationMessage state={state} pending={pending} />
      </form>
    </section>
  )
}

function SettingField({
  field,
  value,
  onChange,
  prefix,
}: {
  field: PluginManifest['settings'][number]
  value: PluginConfig['settings'][string]
  onChange: (value: PluginConfig['settings'][string]) => void
  prefix: string
}) {
  const id = `${prefix}-${field.key}`
  const describedBy = field.description ? `${id}-description` : undefined
  return (
    <div className={styles.settingField}>
      {field.type === 'boolean' ? (
        <label className={styles.checkbox} htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      ) : (
        <>
          <label htmlFor={id}>{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea
              id={id}
              aria-label={field.label}
              aria-describedby={describedBy}
              value={String(value)}
              rows={4}
              maxLength={10000}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <input
              id={id}
              aria-label={field.label}
              aria-describedby={describedBy}
              type={field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : 'text'}
              min={field.type === 'number' ? field.min : undefined}
              max={field.type === 'number' ? field.max : undefined}
              step={field.type === 'number' ? 'any' : undefined}
              required={field.type === 'number'}
              maxLength={field.type === 'text' ? 1000 : undefined}
              value={String(value)}
              onChange={(event) =>
                onChange(
                  field.type === 'number' && event.target.value !== ''
                    ? Number(event.target.value)
                    : event.target.value,
                )
              }
            />
          )}
        </>
      )}
      {field.description && <small id={describedBy}>{field.description}</small>}
    </div>
  )
}

function InstalledPluginCard({ plugin }: { plugin: InstalledPlugin }) {
  const router = useRouter()
  const prefix = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [config, setConfig] = useState(plugin.config)
  const [savedJson, setSavedJson] = useState(JSON.stringify(plugin.config))
  const [revision, setRevision] = useState(plugin.revision)
  const [operation, setOperation] = useState<Operation>('toggle')
  const [fileError, setFileError] = useState('')
  const [discardPrevious, setDiscardPrevious] = useState(false)
  const json = JSON.stringify(config)
  const dirty = savedJson !== json

  function mutation(
    action: (state: PluginActionState, data: FormData) => Promise<PluginActionState>,
    kind: Operation,
  ) {
    return async (previous: PluginActionState, data: FormData) => {
      const result = await action(previous, data)
      if (result.success) {
        if (result.revision !== undefined) setRevision(result.revision)
        if (kind === 'config') setSavedJson(String(data.get('config')))
        if (kind === 'replace') {
          if (fileInput.current) fileInput.current.value = ''
          setFileError('')
        }
        router.refresh()
      }
      return result
    }
  }
  const [toggleState, toggleAction, toggling] = useActionState(mutation(togglePlugin, 'toggle'), {})
  const [configState, configAction, configuring] = useActionState(
    mutation(savePluginConfig, 'config'),
    {},
  )
  const [replaceState, replaceAction, replacing] = useActionState(
    mutation(replacePlugin, 'replace'),
    {},
  )
  const [uninstallState, uninstallAction, uninstalling] = useActionState(
    mutation(uninstallPlugin, 'uninstall'),
    {},
  )
  const busy = toggling || configuring || replacing || uninstalling
  const state = {
    toggle: toggleState,
    config: configState,
    replace: replaceState,
    uninstall: uninstallState,
  }[operation]

  useEffect(() => {
    if (!dirty && plugin.revision >= revision) {
      setConfig(plugin.config)
      setSavedJson(JSON.stringify(plugin.config))
      setRevision(plugin.revision)
    }
  }, [plugin.config, plugin.revision, revision, dirty])

  useEffect(() => {
    if (plugin.enabled) setDiscardPrevious(false)
  }, [plugin.enabled])

  function setPlacement(widgetId: string, slot: (typeof pluginSlots)[number], checked: boolean) {
    setConfig((current) => ({
      ...current,
      placements: checked
        ? [...current.placements, { widgetId, slot }]
        : current.placements.filter((item) => item.widgetId !== widgetId || item.slot !== slot),
    }))
  }
  function identityFields() {
    return (
      <>
        <input type="hidden" name="id" value={plugin.id} />
        <input type="hidden" name="revision" value={revision} />
      </>
    )
  }

  return (
    <article
      className={`${styles.card}${plugin.enabled ? ` ${styles.active}` : ''}`}
      aria-label={plugin.manifest.name}
    >
      <header className={styles.cardHeader}>
        <div className={styles.pluginHeading}>
          <span className={styles.pluginIcon} aria-hidden="true">
            <SettingsIcon />
          </span>
          <div>
            <h2>{plugin.manifest.name}</h2>
            <p className={styles.metadata}>
              Versi {plugin.manifest.version}
              {plugin.manifest.author ? ` · Oleh ${plugin.manifest.author}` : ''}
            </p>
          </div>
        </div>
        <span className={`${styles.badge} ${plugin.enabled ? styles.enabled : styles.disabled}`}>
          {plugin.enabled ? 'Aktif' : 'Nonaktif'}
        </span>
      </header>
      <p className={styles.description}>{plugin.manifest.description}</p>
      <div className={styles.cardActions}>
        <form action={toggleAction} onSubmit={() => setOperation('toggle')}>
          {identityFields()}
          <input type="hidden" name="enabled" value={String(!plugin.enabled)} />
          <button
            type="submit"
            className={plugin.enabled ? styles.deactivate : 'button'}
            disabled={busy}
          >
            {toggling ? 'Memperbarui…' : plugin.enabled ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </form>
        <span className={styles.widgetCount}>
          {plugin.manifest.extensions?.contentSeo ? 'SEO konten · ' : ''}
          {plugin.manifest.widgets.length} widget · {plugin.manifest.pageTemplates?.length ?? 0}{' '}
          templat laman
        </span>
        <small className={styles.pluginId}>{plugin.id}</small>
      </div>
      <MutationMessage state={state} pending={busy} />
      {state.error?.includes('tab lain') && (
        <button
          type="button"
          onClick={() => {
            if (
              !dirty ||
              window.confirm('Muat versi terbaru dan buang pengaturan lokal yang belum disimpan?')
            )
              window.location.reload()
          }}
        >
          Muat versi terbaru
        </button>
      )}
      {!!plugin.manifest.pageTemplates?.length && (
        <div className={styles.hint}>
          <strong>Templat laman: </strong>
          {plugin.manifest.pageTemplates.map((template) => template.name).join(', ')}.{' '}
          {plugin.enabled
            ? 'Pilih melalui Atribut Laman saat membuat atau mengedit halaman.'
            : 'Aktifkan plugin untuk menyediakan templat ini di editor halaman.'}
        </div>
      )}
      {(plugin.manifest.widgets.length > 0 || plugin.manifest.settings.length > 0) && (
        <details className={styles.details}>
          <summary>
            {plugin.manifest.widgets.length
              ? 'Pengaturan dan penempatan widget'
              : 'Pengaturan plugin'}
          </summary>
          <form
            action={configAction}
            onReset={(event) => event.preventDefault()}
            onSubmit={() => setOperation('config')}
          >
            {identityFields()}
            <input type="hidden" name="config" value={json} />
            <fieldset disabled={busy}>
              {plugin.manifest.settings.length > 0 && (
                <div className={styles.settingsGrid}>
                  {plugin.manifest.settings.map((field) => (
                    <SettingField
                      key={field.key}
                      prefix={prefix}
                      field={field}
                      value={config.settings[field.key] ?? field.default}
                      onChange={(value) =>
                        setConfig((current) => ({
                          ...current,
                          settings: { ...current.settings, [field.key]: value },
                        }))
                      }
                    />
                  ))}
                </div>
              )}
              {plugin.manifest.widgets.length > 0 && (
                <div className={styles.placements}>
                  <h3>Letakkan widget di situs</h3>
                  <p>
                    Pilih posisi umum untuk setiap widget. Widget juga dapat disusun bersama bagian
                    lain melalui <Link href="/admin/appearance">Tampilan</Link>.
                  </p>
                  {plugin.manifest.widgets.map((widget) => (
                    <fieldset className={styles.widgetPlacement} key={widget.id}>
                      <legend>{widget.name}</legend>
                      {pluginSlots.map((slot) => (
                        <label className={styles.checkbox} key={slot}>
                          <input
                            type="checkbox"
                            checked={config.placements.some(
                              (item) => item.widgetId === widget.id && item.slot === slot,
                            )}
                            onChange={(event) =>
                              setPlacement(widget.id, slot, event.target.checked)
                            }
                          />
                          <span>{pluginSlotLabels[slot]}</span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              )}
              {!plugin.enabled && (
                <p className={styles.hint}>
                  Plugin sedang nonaktif. Pengaturan disimpan dan fitur tersedia setelah plugin
                  diaktifkan.
                </p>
              )}
              {plugin.enabled &&
                plugin.manifest.widgets.length > 0 &&
                config.placements.length === 0 && (
                  <p className={styles.hint}>
                    Pilih posisi di atas atau tambahkan widget melalui Tampilan agar plugin tampil
                    di situs.
                  </p>
                )}
              <div className={styles.saveRow}>
                <button type="submit" disabled={busy || !dirty}>
                  {configuring ? 'Menyimpan…' : 'Simpan pengaturan plugin'}
                </button>
                {dirty && <span role="status">Ada pengaturan yang belum disimpan.</span>}
              </div>
            </fieldset>
          </form>
        </details>
      )}
      <details className={styles.details}>
        <summary>Perbarui paket ZIP</summary>
        <p>
          Unggah versi baru dengan ID plugin yang sama. Pengaturan dan penempatan yang masih cocok
          dipertahankan.
        </p>
        <form
          action={replaceAction}
          onReset={(event) => event.preventDefault()}
          onSubmit={(event) => {
            if (fileError || dirty) {
              event.preventDefault()
              return
            }
            setOperation('replace')
          }}
        >
          {identityFields()}
          <fieldset disabled={busy || dirty}>
            <ZipInput
              inputRef={fileInput}
              id={`${prefix}-replace-file`}
              label={`ZIP pembaruan ${plugin.manifest.name}`}
              error={fileError}
              onError={setFileError}
            />
            <button type="submit" disabled={busy || dirty || Boolean(fileError)}>
              {replacing ? 'Memperbarui…' : 'Perbarui plugin'}
            </button>
          </fieldset>
          {dirty && (
            <p className={styles.hint}>Simpan pengaturan yang diubah sebelum memperbarui paket.</p>
          )}
        </form>
      </details>
      <footer className={styles.cardFooter}>
        <span>
          {plugin.enabled
            ? 'Nonaktifkan plugin untuk menghapus paket.'
            : 'Pengaturan tetap tersedia saat plugin nonaktif.'}
        </span>
        <form
          className={styles.uninstallForm}
          action={uninstallAction}
          onReset={(event) => event.preventDefault()}
          onSubmit={(event) => {
            const question = discardPrevious
              ? `Hapus plugin ${plugin.manifest.name} beserta pengaturannya dan hapus versi pemulihan Tampilan terakhir jika memakai plugin ini?`
              : `Hapus plugin ${plugin.manifest.name} beserta pengaturannya?`
            if (!window.confirm(question)) {
              event.preventDefault()
              return
            }
            setOperation('uninstall')
          }}
        >
          {identityFields()}
          {!plugin.enabled && (
            <div className={styles.deletionOptions}>
              <label className={styles.checkbox} htmlFor={`${prefix}-discard-previous`}>
                <input
                  id={`${prefix}-discard-previous`}
                  type="checkbox"
                  name="discardPrevious"
                  value="true"
                  checked={discardPrevious}
                  disabled={busy}
                  aria-describedby={`${prefix}-discard-previous-hint`}
                  onChange={(event) => setDiscardPrevious(event.target.checked)}
                />
                <span>Hapus versi pemulihan Tampilan yang memakai plugin ini</span>
              </label>
              <small id={`${prefix}-discard-previous-hint`}>
                Versi pemulihan terakhir hanya ikut dihapus jika memakai plugin ini. Hapus widget
                plugin dari rancangan dan tampilan aktif terlebih dahulu.
              </small>
            </div>
          )}
          <button type="submit" className={styles.delete} disabled={busy || plugin.enabled}>
            {uninstalling ? 'Menghapus…' : 'Hapus plugin'}
          </button>
        </form>
      </footer>
    </article>
  )
}

export function PluginManager({ plugins }: { plugins: InstalledPlugin[] }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(plugins.length === 0)
  const activeCount = plugins.filter((plugin) => plugin.enabled).length
  const visible = plugins.filter(
    (plugin) =>
      (filter === 'all' || (filter === 'active' ? plugin.enabled : !plugin.enabled)) &&
      `${plugin.manifest.name} ${plugin.manifest.description} ${plugin.id}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  )
  return (
    <div className={styles.manager}>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">FITUR TAMBAHAN</p>
          <h1>Plugin</h1>
          <p className="adminPageIntro">Tambahkan SEO, widget, dan templat laman melalui plugin.</p>
        </div>
        <button
          type="button"
          className="button"
          aria-expanded={uploadOpen}
          aria-controls="plugin-upload"
          onClick={() => setUploadOpen((open) => !open)}
        >
          <PlusIcon aria-hidden="true" /> Tambah plugin
        </button>
      </div>
      <div className={styles.introduction}>
        <strong>Plugin khusus NextPress</strong>
        <p>
          Widget memakai HTML, CSS, dan JavaScript; templat laman memakai blok JSON. Plugin PHP dari
          WordPress memerlukan paket yang dibuat ulang untuk CMS ini. Fitur yang berjalan di server
          hanya aktif setelah modulnya ikut dikompilasi ke dalam build.
        </p>
      </div>
      <div id="plugin-upload" hidden={!uploadOpen}>
        <UploadPlugin />
      </div>
      <div className={styles.listTools}>
        <div className={styles.filters} aria-label="Filter plugin">
          {(
            [
              ['all', 'Semua', plugins.length],
              ['active', 'Aktif', activeCount],
              ['inactive', 'Nonaktif', plugins.length - activeCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
        <label className={styles.search}>
          Cari plugin
          <input
            type="search"
            value={search}
            maxLength={120}
            placeholder="Nama atau deskripsi plugin"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className={styles.pluginList}>
        {visible.map((plugin) => (
          <InstalledPluginCard key={plugin.id} plugin={plugin} />
        ))}
        {plugins.length === 0 && (
          <section className={styles.empty}>
            <FolderIcon aria-hidden="true" />
            <h2>Mulai dari plugin pertama</h2>
            <p>
              Unggah ZIP berisi plugin.json di atas. Paket yang terpasang mulai dalam keadaan
              nonaktif agar Anda dapat mengatur penempatan sebelum mengaktifkannya.
            </p>
          </section>
        )}
        {plugins.length > 0 && visible.length === 0 && (
          <section className={styles.empty}>
            <h2>Tidak ada plugin yang cocok</h2>
            <p>Ubah kata pencarian atau pilih filter lain.</p>
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setFilter('all')
              }}
            >
              Tampilkan semua plugin
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
