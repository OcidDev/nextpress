'use client'
// client
import { useActionState } from 'react'
import { moderateComment } from '@/server/actions/comments'
export function ModerateForm({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(moderateComment, {})
  return (
    <form action={action} className="adminModerationForm">
      <input type="hidden" name="id" value={id} />
      <select name="status" aria-label="Status komentar" defaultValue={status}>
        <option value="pending">Menunggu</option>
        <option value="approved">Disetujui</option>
        <option value="spam">Spam</option>
      </select>
      <button disabled={pending}>Simpan status</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  )
}
