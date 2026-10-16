import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { mediaDetails } from '@/lib/db/queries/admin-list'
import { MediaDetailPage } from '@/components/admin/MediaDetailPage'
import { siteConfig } from '@/data/site-config'

export default async function MediaDetail({ params }: { params: Promise<{ id: string }> }) {
  const item = await mediaDetails((await params).id)
  if (!item) notFound()
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
      <div className="adminPageHeading">
        <h1>Detail lampiran</h1>
        <Link href="/admin/media">Kembali ke media</Link>
      </div>
      <MediaDetailPage
        item={{ ...item, createdAt: item.createdAt.toISOString() }}
        baseUrl={baseUrl}
      />
    </>
  )
}
