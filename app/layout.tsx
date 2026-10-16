import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { siteConfig } from '@/data/site-config'
import { createThemeInitScript, validTheme } from '@/lib/theme'
import { getSettings } from '@/lib/db/queries/settings'
import './globals.css'

const sans = localFont({
  src: [
    { path: '../public/fonts/google-sans-text-regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/google-sans-text-bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['Arial', 'Helvetica', 'sans-serif'],
})
const mono = localFont({
  src: '../public/fonts/google-sans-mono-regular.woff2',
  variable: '--font-mono',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings()
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: settings.name, template: `%s — ${settings.name}` },
    description: settings.description,
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
  return (
    <html
      lang={siteConfig.language}
      dir={siteConfig.direction}
      data-mode={settings.defaultMode}
      data-theme={settings.defaultTheme}
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
