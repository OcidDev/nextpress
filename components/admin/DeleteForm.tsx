'use client'
// client — destructive changes require an explicit confirmation.
import { useActionState } from 'react'
import type { ActionState } from '@/lib/content/validation'
export function DeleteForm({
  id,
  action,
  label = 'Hapus',
  confirmation = 'Hapus data ini secara permanen?',
}: {
  id: string
  action: (state: ActionState, data: FormData) => Promise<ActionState>
  confirmation?: string
  label?: string
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button disabled={pending}>{label}</button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  )
}
