'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { customizeTheme } from '@/server/actions/theme-customization'
import {
  resolveThemeValues,
  type ThemeCustomization,
  type ThemeCustomizationState,
  type ThemeValues,
} from '@/lib/themes/customization'
import { useUnsavedChanges } from '@/components/admin/useUnsavedChanges'

export function ThemeCustomizer({
  themeId,
  name,
  hash,
  config,
  initial,
  activeThemeId,
  isActive = true,
}: {
  activeThemeId?: string
  isActive?: boolean
  themeId: string
  name: string
  hash: string
  config: ThemeCustomization
  initial: ThemeCustomizationState
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const sendPreview = () =>
    frame.current?.contentWindow?.postMessage(
      { type: 'cms-theme-preview', themeId, values },
      location.origin,
    )
  const [state, setState] = useState(initial)
  const [values, setValues] = useState(() =>
    resolveThemeValues(config, initial.draft ?? initial.active),
  )
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [pending, startTransition] = useTransition()
  const { dirty, setDirty } = useUnsavedChanges()
  useEffect(() => {
    sendPreview()
  }, [values]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (
        event.origin === location.origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === 'cms-theme-preview-ready'
      )
        sendPreview()
    }
    window.addEventListener('message', ready)
    return () => window.removeEventListener('message', ready)
  }, [values]) // eslint-disable-line react-hooks/exhaustive-deps
  function change(next: ThemeValues) {
    setValues(next)
    setDirty(true)
    setMessage('')
    setError('')
  }
  function submit(operation: 'save' | 'apply' | 'discard') {
    setError('')
    setMessage('')
    startTransition(async () => {
      try {
        const result = await customizeTheme({
          themeId,
          activeThemeId,
          hash,
          revision: state.revision,
          operation,
          values: operation === 'save' ? values : undefined,
        })
        if (result.error || !result.state) {
          setError(result.error ?? 'Gagal menyimpan pengaturan.')
          return
        }
        setState(result.state)
        setValues(resolveThemeValues(config, result.state.draft ?? result.state.active))
        setDirty(false)
        setMessage(
          operation === 'save'
            ? 'Rancangan tersimpan. Periksa pratinjau sebelum menerapkan.'
            : operation === 'apply'
              ? 'Pengaturan tema diterapkan ke situs.'
              : 'Rancangan dibuang. Pengaturan aktif tetap digunakan.',
        )
      } catch {
        setError('Pengaturan belum dapat disimpan. Silakan coba lagi.')
      }
    })
  }
  return (
    <div className={`siteEditorBody ${panelOpen ? '' : 'siteEditorPanelClosed'}`}>
      <div className="adminActions siteEditorActions">
        <button type="button" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
          Panel desain
        </button>
        <span className="siteEditorStatus">
          {pending
            ? 'Menyimpan…'
            : dirty
              ? 'Belum disimpan'
              : state.draft
                ? 'Rancangan tersimpan'
                : 'Tersimpan'}
        </span>
        <button
          type="button"
          className="button"
          disabled={pending || (!dirty && state.draft !== null)}
          onClick={() => submit('save')}
        >
          {pending ? 'Memproses…' : 'Simpan rancangan'}
        </button>
        <button
          type="button"
          className="button"
          disabled={pending || dirty || state.draft === null || !isActive}
          onClick={() => submit('apply')}
        >
          Terapkan ke situs
        </button>
        {state.draft !== null && (
          <button
            type="button"
            className="button"
            disabled={pending || dirty}
            onClick={() => submit('discard')}
          >
            Buang rancangan
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="adminError">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {dirty && (
        <p role="status">Ada perubahan belum disimpan. Pratinjau menampilkan perubahan Anda.</p>
      )}
      <div className="themeCustomizerWorkspace">
        <div className="themeCustomizerControls">
          <h2>Desain</h2>
          <p>Sesuaikan gaya situs Anda.</p>
          {!isActive && (
            <p>Tema belum aktif. Anda dapat menyimpan rancangan tanpa mengubah situs.</p>
          )}
          {config.presets.length > 0 && (
            <fieldset disabled={pending} className="themeCustomizerGroup">
              <legend>Variasi gaya</legend>
              <div className="themeCustomizerPresets">
                {config.presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => change(resolveThemeValues(config, preset.values))}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {(['Warna', 'Tipografi', 'Tata letak'] as const)
            .filter((group) => config.controls.some((c) => c.group === group))
            .map((group) => (
              <fieldset key={group} disabled={pending} className="themeCustomizerGroup">
                <legend>{group}</legend>
                {config.controls
                  .filter((c) => c.group === group)
                  .map((control) => (
                    <div key={control.id} className="themeCustomizerField">
                      <label htmlFor={`theme-setting-${control.id}`}>{control.label}</label>
                      {control.type === 'select' ? (
                        <select
                          id={`theme-setting-${control.id}`}
                          value={values[control.id]}
                          onChange={(e) => change({ ...values, [control.id]: e.target.value })}
                        >
                          {control.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : control.type === 'color' ? (
                        <div className="themeCustomizerColor">
                          <input
                            id={`theme-setting-${control.id}`}
                            type="color"
                            value={String(values[control.id])}
                            onChange={(e) => change({ ...values, [control.id]: e.target.value })}
                          />
                          <span>{values[control.id]}</span>
                        </div>
                      ) : (
                        <div>
                          <input
                            id={`theme-setting-${control.id}`}
                            type="range"
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            value={values[control.id]}
                            onChange={(e) =>
                              change({ ...values, [control.id]: Number(e.target.value) })
                            }
                          />
                          <output htmlFor={`theme-setting-${control.id}`}>
                            {values[control.id]}
                            {control.unit}
                          </output>
                        </div>
                      )}
                    </div>
                  ))}
              </fieldset>
            ))}
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() => change(resolveThemeValues(config))}
          >
            Kembalikan gaya bawaan
          </button>
          <p className="appearanceHint">
            Perubahan diterbitkan setelah Anda menyimpan rancangan dan memilih Terapkan ke situs.
          </p>
        </div>
        <section className="themeCustomizerPreview" aria-label="Pratinjau tema">
          <div className="appearancePreviewHeading">
            <h2>Pratinjau</h2>
            <div className="appearanceDevices">
              <button
                type="button"
                aria-pressed={device === 'desktop'}
                onClick={() => setDevice('desktop')}
              >
                Desktop
              </button>
              <button
                type="button"
                aria-pressed={device === 'mobile'}
                onClick={() => setDevice('mobile')}
              >
                Ponsel
              </button>
            </div>
          </div>
          <p className="appearanceHint">
            {state.draft === null ? 'Pratinjau privat tema.' : 'Situs publik belum berubah.'}
          </p>
          <iframe
            ref={frame}
            onLoad={sendPreview}
            key={state.revision}
            title={`Pratinjau ${name}`}
            src={`/preview/theme/${themeId}?draft=1&revision=${state.revision}`}
            style={{ width: device === 'mobile' ? '390px' : '100%' }}
          />
        </section>
      </div>
    </div>
  )
}
