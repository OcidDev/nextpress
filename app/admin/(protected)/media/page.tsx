import { MediaLibrary } from '@/components/admin/MediaLibrary'
import { listedMedia, type ListSearch } from '@/lib/db/queries/admin-list'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { headers } from 'next/headers'
import { siteConfig } from '@/data/site-config'

export default async function MediaPage({ searchParams }: { searchParams: Promise<ListSearch> }) {
  const search = await searchParams
  const result = await listedMedia(search)
  const reqHeaders = await headers()
  const host = reqHeaders.get('x-forwarded-host') || reqHeaders.get('host')
  const proto =
    reqHeaders.get('x-forwarded-proto') ||
    (host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https')
  const baseUrl = host
    ? `${proto}://${host}`
    : process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url || 'http://localhost:3000'
  return (
    <>
      <MediaLibrary
        items={result.rows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))}
        params={result.params}
        months={result.months}
        baseUrl={baseUrl}
        total={result.total}
      />
      <AdminPagination basePath="/admin/media" {...result} />
    </>
  )
}
