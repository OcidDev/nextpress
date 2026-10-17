'use client'

import { useActionState, useState } from 'react'
import type { SiteSettings } from '@/lib/content/settings'
import { saveSettings } from '@/server/actions/operations'
import { NavigationFields, type AppearanceChoices } from './appearance/Fields'
import { useUnsavedChanges } from './useUnsavedChanges'

export function MenuSettingsForm({
  initial,
  choices,
}: {
  initial: SiteSettings
  choices: Pick<AppearanceChoices, 'pages' | 'categories'>
}) {
  const [value, setValue] = useState(() => ({
    navigation: initial.navigation,
    secondaryNavigation: initial.secondaryNavigation,
  }))
  const { dirty, setDirty } = useUnsavedChanges()
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof saveSettings>[0], data: FormData) => {
      const result = await saveSettings(previous, data)
      if (result.success) setDirty(false)
      return result
    },
    {},
  )

  return (
    <form action={action} className="adminForm settingGroup appearanceFields">
      <p>
        Kelola tautan, submenu, dan urutan navigasi situs. Pengaturan ini tetap tersedia saat
        berganti tema. Perubahan langsung diterapkan setelah disimpan.
      </p>
      <input type="hidden" name="section" value="menus" />
      <input type="hidden" name="settings" value={JSON.stringify(value)} />
      <fieldset disabled={pending} className="appearanceGroup">
        <legend>Navigasi situs</legend>
        <NavigationFields
          site={value}
          choices={choices}
          onChange={(next) => {
            setValue(next)
            setDirty(true)
          }}
        />
      </fieldset>
      {state.error && <p role="alert">{state.error}</p>}
      {dirty ? (
        <p role="status">Ada perubahan yang belum disimpan.</p>
      ) : state.success ? (
        <p role="status">Menu tersimpan.</p>
      ) : null}
      <button className="button" disabled={pending}>
        {pending ? 'Menyimpan…' : 'Simpan menu'}
      </button>
    </form>
  )
}
