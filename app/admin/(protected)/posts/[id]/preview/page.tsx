import { notFound } from 'next/navigation'
import Link from 'next/link'
import { adminPost } from '@/lib/db/queries/admin-content'
import { PostContent } from '@/components/post/PostContent'
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const post = await adminPost((await params).id)
  if (!post) notFound()
  return (
    <>
      <p className="adminNotice">Preview privat · {post.status}</p>
      <Link href={`/admin/posts/${post.id}`}>Kembali ke editor</Link>
      <h1>{post.title}</h1>
      <PostContent html={post.content} />
    </>
  )
}
