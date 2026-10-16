import type { FooterColumn } from '@/types'

/**
 * Footer 4 kolom: 1 kolom brand + 3 kolom tautan.
 *
 * Tautan awal tema CMS; route kontennya diimplementasikan pada sprint berikutnya.
 *
 * Kredit vendor "Developed by NLD Blog" tidak dibawa (keputusan owner #7).
 */
export const footerColumns: FooterColumn[] = [
  {
    title: 'Tentang',
    links: [
      { label: 'Tentang Kami', href: '/tentang-kami' },
      { label: 'Kontak', href: '/kontak' },
      { label: 'Arsip', href: '/archive' },
    ],
  },
  {
    title: 'Kategori',
    links: [
      { label: 'Teknologi', href: '/category/teknologi' },
      { label: 'Tutorial', href: '/category/tutorial' },
      { label: 'Cerita', href: '/category/cerita' },
    ],
  },
  {
    title: 'Bantuan',
    links: [
      { label: 'Sitemap', href: '/sitemap' },
      { label: 'Disclaimer', href: '/disclaimer' },
      { label: 'Privacy Policy', href: '/privacy-policy' },
    ],
  },
]
