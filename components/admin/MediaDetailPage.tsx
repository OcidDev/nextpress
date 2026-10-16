'use client'
import { useRouter } from 'next/navigation'
import { AttachmentDetails, type LibraryMedia } from './MediaLibrary'
export function MediaDetailPage({ item, baseUrl }: { item: LibraryMedia; baseUrl: string }) {
  const router = useRouter()
  return (
    <AttachmentDetails
      item={item}
      baseUrl={baseUrl}
      onDeleted={() => router.push('/admin/media')}
    />
  )
}
