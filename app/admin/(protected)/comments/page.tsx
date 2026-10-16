import Link from 'next/link'
import { listedComments, type ListSearch } from '@/lib/db/queries/admin-list'
import { ListFilters } from '@/components/admin/ListFilters'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { ModerateForm } from '@/components/admin/ModerateForm'
import { formatDate } from '@/lib/utils'

export default async function Comments({ searchParams }: { searchParams: Promise<ListSearch> }) {
  const result = await listedComments(await searchParams)
  return (
    <>
      <h1>Moderasi komentar</h1>
      <ListFilters
        basePath="/admin/comments"
        params={result.params}
        label="Komentar"
        statuses={[
          { value: 'pending', label: 'Menunggu' },
          { value: 'approved', label: 'Disetujui' },
          { value: 'spam', label: 'Spam' },
        ]}
      />
      {!result.rows.length && (
        <p>
          {result.params.q || result.params.status
            ? 'Tidak ada komentar yang sesuai dengan filter.'
            : 'Belum ada komentar.'}
        </p>
      )}
      <div className="adminCommentList">
        {result.rows.map((comment) => (
          <article className="panel adminCommentCard" key={comment.id}>
            <header>
              <h2>
                <Link href={`/admin/posts/${comment.postId}`}>{comment.title}</Link>
              </h2>
              <small>{formatDate(comment.createdAt.toISOString())}</small>
            </header>
            <p>
              <strong>{comment.authorName}</strong> · {comment.authorEmail}
            </p>
            <p className="adminCommentContent">{comment.content}</p>
            <ModerateForm id={comment.id} status={comment.status} />
          </article>
        ))}
      </div>
      <AdminPagination basePath="/admin/comments" {...result} />
    </>
  )
}
