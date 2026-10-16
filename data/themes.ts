import type { ThemeId } from '@/types'

export interface ThemeOption {
  /** Nilai atribut data-theme pada <html>. */
  id: ThemeId
  label: string
  /** Warna contoh untuk tombol pemilih tema. */
  swatch: string
}

/**
 * 11 palet warna situs. Palet lengkap tiap tema ada di app/globals.css; di sini
 * hanya metadata yang dibutuhkan UI pemilih tema.
 */
export const themeOptions: ThemeOption[] = [
  { id: '0', label: 'Default', swatch: '#482dff' },
  { id: '1', label: 'Merah', swatch: '#D32F2F' },
  { id: '2', label: 'Hijau', swatch: '#00796B' },
  { id: '3', label: 'Biru', swatch: '#1565C0' },
  { id: '4', label: 'Kuning', swatch: '#FFC107' },
  { id: '5', label: 'Pink', swatch: '#C2185B' },
  { id: '6', label: 'Oranye', swatch: '#E64A19' },
  { id: '7', label: 'Biru Abu', swatch: '#455A64' },
  { id: '8', label: 'Cokelat', swatch: '#5D4037' },
  { id: '9', label: 'Ungu', swatch: '#7B1FA2' },
  { id: '10', label: 'Indigo', swatch: '#283593' },
]

export const themeIds = themeOptions.map((t) => t.id)

/** Nama key localStorage; dipakai juga oleh script anti-FOUC di layout. */
export const THEME_STORAGE_KEY = 'nextpress-theme'
export const MODE_STORAGE_KEY = 'nextpress-mode'
