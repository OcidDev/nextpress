'use client'

import { useActionState, useState } from 'react'
import type { SiteSettings } from '@/lib/content/settings'
import { saveSettings } from '@/server/actions/operations'
import {
  LinksFields,
  SocialFields,
  TextField,
  ToggleField,
  type AppearanceChoices,
} from './appearance/Fields'
import { useUnsavedChanges } from './useUnsavedChanges'

export function SiteLinksSettingsForm({
  section,
  initial,
  choices,
}: {
  section: 'footer' | 'social'
  choices: Pick<AppearanceChoices, 'pages' | 'categories'>
  initial: SiteSettings
}) {
  const [value, setValue] = useState(initial)
  const { dirty, setDirty } = useUnsavedChanges()
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof saveSettings>[0], data: FormData) => {
      const result = await saveSettings(previous, data)
      if (result.success) setDirty(false)
      return result
    },
    {},
  )
  function update(patch: Partial<SiteSettings>) {
    setValue((current) => ({ ...current, ...patch }))
    setDirty(true)
  }
  function column(index: number, patch: Partial<SiteSettings['footer'][number]>) {
    update({ footer: value.footer.map((item, i) => (i === index ? { ...item, ...patch } : item)) })
  }
  return (
    <form action={action} className="adminForm settingGroup appearanceFields">
      <p>
        Tautan tersimpan sebagai pengaturan situs dan tetap tersedia saat berganti tema. Tema
        menentukan letak dan tampilannya.
      </p>
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="settings" value={JSON.stringify({ [section]: value[section] })} />
      <fieldset disabled={pending} className="appearanceGroup">
        <legend>{section === 'footer' ? 'Kolom tautan footer' : 'Tautan sosial'}</legend>
        {section === 'social' ? (
          <SocialFields site={value} onChange={update} />
        ) : (
          <>
            {value.footer.map((item, index) => (
              <fieldset key={index} className="appearanceGroup">
                <legend>Kolom {index + 1}</legend>
                <TextField
                  label="Judul kolom"
                  value={item.title}
                  maxLength={80}
                  onChange={(title) => column(index, { title })}
                />
                <ToggleField
                  label="Tampilkan kolom"
                  value={item.enabled}
                  onChange={(enabled) => column(index, { enabled })}
                />
                <LinksFields
                  links={item.links}
                  choices={choices}
                  onChange={(links) => column(index, { links })}
                />
                <div className="appearanceInlineActions">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      const footer = [...value.footer]
                      ;[footer[index - 1], footer[index]] = [footer[index]!, footer[index - 1]!]
                      update({ footer })
                    }}
                  >
                    Naikkan kolom
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ footer: value.footer.filter((_, i) => i !== index) })}
                  >
                    Hapus kolom
                  </button>
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              disabled={value.footer.length >= 3}
              onClick={() =>
                update({
                  footer: [...value.footer, { title: 'Kolom baru', links: [], enabled: true }],
                })
              }
            >
              Tambah kolom
            </button>
          </>
        )}
      </fieldset>
      {state.error && <p role="alert">{state.error}</p>}
      <p role="status">{dirty ? 'Ada perubahan yang belum disimpan.' : state.success}</p>
      <button className="button" disabled={pending}>
        {pending ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
    </form>
  )
}
