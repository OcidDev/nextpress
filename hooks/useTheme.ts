'use client'
// client — synchronise preference controls, tabs and pre-hydration attributes.
import { useEffect, useState } from 'react'
import { MODE_STORAGE_KEY, THEME_STORAGE_KEY } from '@/data/themes'
import { validMode, validTheme } from '@/lib/theme'
import type { ThemeId, ThemeMode } from '@/types'

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [theme, setThemeState] = useState<ThemeId>('0')

  useEffect(() => {
    const sync = () => {
      setModeState(validMode(document.documentElement.dataset.mode))
      setThemeState(validTheme(document.documentElement.dataset.theme))
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODE_STORAGE_KEY || event.key === null) {
        document.documentElement.dataset.mode = validMode(event.newValue)
      }
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        document.documentElement.dataset.theme = validTheme(event.newValue)
      }
      sync()
    }
    sync()
    window.addEventListener('storage', onStorage)
    window.addEventListener('blog:theme-change', sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('blog:theme-change', sync)
    }
  }, [])

  function update(key: string, attribute: 'mode' | 'theme', value: string) {
    document.documentElement.dataset[attribute] = value
    try {
      localStorage.setItem(key, value)
    } catch {
      /* Preference still works without storage. */
    }
    window.dispatchEvent(new Event('blog:theme-change'))
  }

  return {
    mode,
    theme,
    setMode: (value: ThemeMode) => update(MODE_STORAGE_KEY, 'mode', validMode(value)),
    setTheme: (value: ThemeId) => update(THEME_STORAGE_KEY, 'theme', validTheme(value)),
  }
}
