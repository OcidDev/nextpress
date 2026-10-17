import { notFound } from 'next/navigation'
import Link from 'next/link'
import { adminPage } from '@/lib/db/queries/admin-content'
import { PostContent } from '@/components/post/PostContent'

export const metadata = { robots: { index: false, follow: false } }

export default async function PagePreview({ params }: { params: Promise<{ id: string }> }) {
  const page = await adminPage((await params).id)
  if (!page || page.status === 'trash') notFound()
  return (
    <>
      <p className="adminNotice">
        Preview privat · versi terakhir yang disimpan ·{' '}
        {page.status === 'published' ? 'Terbit' : 'Draft'}
      </p>
      <Link href={`/admin/pages/${page.id}`}>Kembali ke editor</Link>
      <h1>{page.title}</h1>
      <PostContent html={page.content} />
    </>
  )
}
