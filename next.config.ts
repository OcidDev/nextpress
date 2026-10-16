import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  experimental: { serverActions: { bodySizeLimit: '6mb' } },

  images: {
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
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self'" }],
      },
      // The CMS only ever embeds its own origin.
      ...['/admin/:path*'].map((source) => ({
        source,
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self'; frame-src 'self'",
          },
        ],
      })),
    ]
  },
}

export default nextConfig
