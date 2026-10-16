import { approvedComments } from '@/lib/db/queries/comments'
import { CommentForm } from './CommentForm'
import { formatSiteDate } from '@/lib/content/site-date'
import { getSettings } from '@/lib/db/queries/settings'
export async function CommentSection({
  postId,
  allowComments,
}: {
  postId: string
  allowComments: boolean
}) {
  const settings = await getSettings()
  const rows = await approvedComments(postId)
  return (
    <section className="panel" style={{ marginBlockStart: 24 }}>
      <h2>Komentar ({rows.length})</h2>
      {rows.map((c) => (
        <article key={c.id}>
          <strong>{c.authorName}</strong> · <small>{formatSiteDate(c.createdAt, settings)}</small>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.content}</p>
        </article>
      ))}
      {allowComments ? <CommentForm postId={postId} /> : <p>Komentar ditutup.</p>}
    </section>
  )
}
