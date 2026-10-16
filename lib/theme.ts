import { MODE_STORAGE_KEY, THEME_STORAGE_KEY, themeIds } from '@/data/themes'
import type { ThemeId, ThemeMode } from '@/types'

export function validMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function validTheme(value: unknown): ThemeId {
  return themeIds.includes(value as ThemeId) ? (value as ThemeId) : '0'
}

// Only validated mode/theme values and static keys are interpolated.
export function createThemeInitScript(mode: ThemeMode = 'system', theme: ThemeId = '0') {
  return `(function(){var d=document.documentElement,m=${JSON.stringify(mode)},t=${JSON.stringify(theme)};try{m=localStorage.getItem('${MODE_STORAGE_KEY}')||${JSON.stringify(mode)};t=localStorage.getItem('${THEME_STORAGE_KEY}')||${JSON.stringify(theme)};}catch(e){}d.dataset.mode=m==='light'||m==='dark'?m:'system';d.dataset.theme=${JSON.stringify(themeIds)}.indexOf(t)>=0?t:'0';})()`
}
