import { publicEnv } from '@/lib/env'

/**
 * Nilai bawaan situs sebelum pengaturan disimpan di database.
 * Hanya nilai publik; yang rahasia tetap di environment variable.
 */
export const siteConfig = {
  name: 'NextPress',
  shortName: 'NextPress',
  monogram: 'n',
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  description: 'Ruang untuk berbagi cerita, pengetahuan, dan inspirasi.',
  locale: 'id_ID',
  language: 'id',
  direction: 'ltr' as 'ltr' | 'rtl',

  author: { name: 'Redaksi' },

  /** Aset bawaan situs. */
  logo: { light: '/images/logo.svg', dark: '/images/logo-dark.svg' },
  ogImage: '/images/og-default.png',

  postsPerPage: 7,
  relatedPostsCount: 6,
  popularPostsCount: 5,

  comments: { enabled: true, moderation: true, maxDepth: 3 },
  ads: {
    enabled: Boolean(publicEnv.NEXT_PUBLIC_ADSENSE_ID),
    publisherId: publicEnv.NEXT_PUBLIC_ADSENSE_ID,
  },
  analytics: { ga4: publicEnv.NEXT_PUBLIC_GA_ID },
  features: {
    greetings: true,
    bookmark: true,
    cookieConsent: true,
    toc: true,
    translate: false,
  },

  /** Default tampilan; dapat ditimpa pilihan pembaca di localStorage. */
  defaults: { mode: 'system' as const, theme: '0' as const },
} as const
