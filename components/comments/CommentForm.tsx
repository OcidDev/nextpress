'use client'
// client — public comments remain pending until an admin approves them.
import { useActionState } from 'react'
import { submitComment } from '@/server/actions/comments'
export function CommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState(submitComment, {})
  return (
    <form action={action} className="searchForm">
      <input type="hidden" name="postId" value={postId} />
      <label>
        Nama
        <input name="authorName" required maxLength={120} />
      </label>
      <label>
        Email (tidak ditampilkan)
        <input name="authorEmail" type="email" required maxLength={200} />
      </label>
      <label>
        Komentar
        <textarea name="content" required minLength={3} maxLength={5000} rows={5} />
      </label>
      <div className="srOnly" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button className="button" disabled={pending}>
        {pending ? 'Mengirim…' : 'Kirim komentar'}
      </button>
      <small>Komentar ditampilkan setelah disetujui moderator.</small>
    </form>
  )
}
