import { z } from 'zod'
import { DEFAULT_CATEGORY_ID } from '@/lib/core/category-tree'
import { siteConfig } from '@/data/site-config'
import { mainNavigation, drawerLinks } from '@/data/navigation'
import { footerColumns } from '@/data/footer'
import { socialLinks } from '@/data/social'
import { safeUrl } from './validation'
const href = z
  .string()
  .max(2000)
  .refine(
    (v) => /^\/(?!\/|\\)/.test(v) || /^https?:\/\//i.test(v),
    'Tautan harus path situs atau URL http(s)',
  )
  .refine((v) => !/[\s\\\u0000-\u001f]/.test(v), 'Tautan tidak valid')
const link = z.object({ label: z.string().trim().min(1).max(80), href })
export const socialPlatforms = [
  { value: 'FacebookIcon', label: 'Facebook' },
  { value: 'InstagramIcon', label: 'Instagram' },
  { value: 'YoutubeIcon', label: 'YouTube' },
  { value: 'TwitterIcon', label: 'Twitter / X' },
  { value: 'LinkedinIcon', label: 'LinkedIn' },
  { value: 'TiktokIcon', label: 'TikTok' },
  { value: 'WhatsappIcon', label: 'WhatsApp' },
  { value: 'TelegramIcon', label: 'Telegram' },
] as const
const nav = z
  .object({
    label: z.string().trim().min(1).max(80),
    href: href.optional(),
    icon: z.string().max(40).default('FolderIcon'),
    children: z.array(link).max(20).optional(),
    divider: z.boolean().optional(),
  })
  .refine((v) => v.href || v.children?.length, 'Menu harus memiliki tautan atau submenu')
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  logo: safeUrl,
  icon: safeUrl.default(''),
  defaultMode: z.enum(['light', 'dark', 'system']),
  defaultTheme: z.string().regex(/^(?:[0-9]|10)$/),
  navigation: z.array(nav).max(20),
  secondaryNavigation: z.array(link).max(20).default(drawerLinks),
  footer: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        links: z.array(link).max(20),
        enabled: z.boolean().default(true),
      }),
    )
    .max(3),
  social: z
    .array(link.extend({ icon: z.enum(socialPlatforms.map((platform) => platform.value)) }))
    .max(10),
  gaId: z.string().regex(/^(?:G-[A-Z0-9]+)?$/),
  commentsEnabled: z.boolean().default(true),
  viewsEnabled: z.boolean().default(false),
  adsenseId: z.string().regex(/^(?:ca-pub-\d+)?$/),

  // WordPress General
  siteUrl: z.string().default(''),
  adminEmail: z.string().email().optional().or(z.literal('')).default(''),
  usersCanRegister: z.boolean().default(false),
  defaultRole: z.enum(['subscriber', 'contributor', 'author', 'editor']).default('subscriber'),
  timezone: z
    .string()
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value })
        return true
      } catch {
        return false
      }
    }, 'Zona waktu tidak valid')
    .default('Asia/Jakarta'),
  dateFormat: z.string().default('d F Y'),
  timeFormat: z.string().default('H:i'),
  startOfWeek: z.number().int().min(0).max(6).default(1),

  // WordPress Writing
  defaultCategory: z.string().default(DEFAULT_CATEGORY_ID),
  defaultPostFormat: z.string().default('standard'),
  pingSites: z.string().default(''),

  // WordPress Reading
  showOnFront: z.enum(['posts', 'page']).default('posts'),
  pageOnFront: z.string().default(''),
  pageForPosts: z.string().default(''),
  postsPerPage: z.number().int().min(1).max(100).default(10),
  postsPerRss: z.number().int().min(1).max(50).default(10),
  rssUseExcerpt: z.boolean().default(false),
  blogPublic: z.boolean().default(true),

  // WordPress Permalinks
  permalinkStructure: z.string().default('/%postname%/'),
  categoryBase: z.string().default('category'),
  tagBase: z.string().default('tag'),
})
export class SettingsValidationError extends Error {}
export type SiteSettings = z.infer<typeof settingsSchema>
export function defaultSettings(): SiteSettings {
  return settingsSchema.parse({
    commentsEnabled: true,
    name: siteConfig.name,
    description: siteConfig.description,
    logo: '',
    defaultMode: 'system',
    defaultTheme: '0',
    navigation: mainNavigation,
    footer: footerColumns,
    social: socialLinks as SiteSettings['social'],
    gaId: siteConfig.analytics.ga4 || '',
    adsenseId: siteConfig.ads.publisherId || '',
  })
}
