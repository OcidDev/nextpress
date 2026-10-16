import type { NavItem } from '@/types'

/** Menu utama situs. */
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

/** Menu tambahan di dasar drawer (dulu widget PageList002). */
export const drawerLinks = [
  { label: 'Sitemap', href: '/sitemap' },
  { label: 'Disclaimer', href: '/disclaimer' },
  { label: 'Privacy', href: '/privacy-policy' },
]

