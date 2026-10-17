import { notFound } from 'next/navigation'
import { adminPost, editorOptions } from '@/lib/db/queries/admin-content'
import { PostEditor } from '@/components/admin/PostEditor'
export default async function EditPost({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const post = await adminPost((await params).id)
  if (!post || post.status === 'trash') notFound()
  return (
    <>
      <h1>Edit artikel</h1>
      <PostEditor
        key={post.id}
        post={post}
        options={await editorOptions()}
        saved={(await searchParams).saved === '1'}
      />
    </>
  )
}
