import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { siteConfig } from '@/data/site-config'
import { createThemeInitScript, validTheme } from '@/lib/theme'
import { getSettings } from '@/lib/db/queries/settings'
import { applyFilters } from '@/lib/extensions/hooks'
import { bootExtensions } from '@/lib/extensions/bootstrap'
import './globals.css'

const sans = localFont({
  src: '../public/fonts/inter-variable.woff2',
  weight: '100 900',
  variable: '--font-sans',
  display: 'swap',
  fallback: ['Arial', 'Helvetica', 'sans-serif'],
})

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings()
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: settings.name, template: `%s — ${settings.name}` },
    description: settings.description,
    icons: { icon: settings.icon || '/icon.svg', apple: settings.icon || '/icon.svg' },
    alternates: {
      canonical: siteConfig.url,
      types: { 'application/rss+xml': new URL('/feed.xml', siteConfig.url).href },
    },
    openGraph: {
      type: 'website',
      siteName: settings.name,
      title: settings.name,
      description: settings.description,
      url: siteConfig.url,
      locale: siteConfig.locale,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: settings.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: settings.name,
      description: settings.description,
      images: ['/opengraph-image'],
    },
  }
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSettings()
  const themeInitScript = createThemeInitScript(
    settings.defaultMode,
    validTheme(settings.defaultTheme),
  )
  // Kernel ekstensi (EXT-02) dimuat sebelum hook apa pun dipakai. `cache()` di
  // dalamnya membuat ini sekali per request, dan `markBooted()` membuatnya
  // idempoten, jadi memanggilnya dari beberapa tempat aman.
  await bootExtensions()
  // `body_class` (EXT-01) berlaku untuk seluruh dokumen, termasuk `/admin` dan
  // `/preview`, karena layout ini dipakai bersama. Ekstensi yang hanya ingin
  // menyasar halaman publik harus memeriksa sendiri kelas yang sudah ada.
  const bodyClass = await applyFilters('body_class', '')
  return (
    <html
      lang={siteConfig.language}
      dir={siteConfig.direction}
      data-mode={settings.defaultMode}
      data-theme={settings.defaultTheme}
      className={sans.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={bodyClass || undefined}>{children} </body>
    </html>
  )
}
