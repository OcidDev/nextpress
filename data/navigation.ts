import type { MobileNavItem, NavItem } from '@/types'

/**
 * Menu utama. Dipakai sebagai nilai bawaan sebelum navigasi disimpan di
 * database.
 */
export const mainNavigation: NavItem[] = [
  { label: 'Beranda', href: '/', icon: 'HomeIcon' },
  {
    label: 'Kategori',
    icon: 'FolderIcon',
    children: [
      { label: 'Teknologi', href: '/category/teknologi' },
      { label: 'Tutorial', href: '/category/tutorial' },
      { label: 'Cerita', href: '/category/cerita' },
    ],
  },
  { label: 'Arsip', href: '/archive', icon: 'FolderIcon' },
  { label: 'Tentang Kami', href: '/tentang-kami', icon: 'ProfilesIcon' },
  { label: 'Kontak', href: '/kontak', icon: 'MessageIcon', divider: true },
]

/** Menu tambahan di dasar drawer. */
export const drawerLinks = [
  { label: 'Sitemap', href: '/sitemap' },
  { label: 'Disclaimer', href: '/disclaimer' },
  { label: 'Privacy', href: '/privacy-policy' },
]

/**
 * Bottom bar mobile.
 * Item "Comments" dan "Share" hanya relevan di halaman artikel, jadi tidak
 * dipasang global — keduanya ada di komponen artikel.
 */
export const mobileNavigation: MobileNavItem[] = [
  { label: 'Beranda', icon: 'HomeIcon', kind: 'link', href: '/' },
  { label: 'Cari', icon: 'SearchIcon', kind: 'action', action: 'search' },
  { label: 'Menu', icon: 'MenuIcon', kind: 'action', action: 'menu' },
  { label: 'Mode', icon: 'MoonSunIcon', kind: 'action', action: 'mode' },
  { label: 'Atas', icon: 'ArowUpCircleIcon', kind: 'action', action: 'top' },
]
