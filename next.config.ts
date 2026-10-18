import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  experimental: { serverActions: { bodySizeLimit: '6mb' } },

  images: {
    // Host gambar eksternal yang tetap diizinkan untuk konten yang sudah ada.
    remotePatterns: [
      { protocol: 'https', hostname: '*.bp.blogspot.com' },
      { protocol: 'https', hostname: 'blogger.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        // Plugin responses supply a stronger sandbox CSP of their own. Next's
        // configured headers replace route headers with the same name.
        source: '/:path((?!api/plugins(?:/|$)).*)',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self'" }],
      },
      // Keep public ad frames compatible; CMS/preview only embed this origin.
      ...['/admin/:path*', '/preview/:path*'].map((source) => ({
        source,
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self'; frame-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'",
          },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      })),
      {
        source: '/api/auth/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
}

export default nextConfig
