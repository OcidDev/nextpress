export type ThemeMode = 'light' | 'dark' | 'system'

/** Indeks tema warna 0–10, mewarisi `theme0`–`theme10` milik template lama. */
export type ThemeId = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'

export interface NavChild {
  label: string
  href: string
}

export interface NavItem {
  label: string
  href?: string
  /** Nama ikon di `components/ui/icons`. */
  icon: string
  children?: NavChild[]
  /** Garis pemisah setelah item ini (dulu class `br`). */
  divider?: boolean
}

export interface SocialLink {
  label: string
  href: string
  icon: string
}

export interface FooterColumn {
  title: string
  links: NavChild[]
  enabled?: boolean
}

export interface MobileNavItem {
  label: string
  icon: string
  /** `link` menuju halaman; `action` memicu perilaku di browser. */
  kind: 'link' | 'action'
  href?: string
  action?: 'search' | 'menu' | 'mode' | 'top' | 'share' | 'comments'
}
