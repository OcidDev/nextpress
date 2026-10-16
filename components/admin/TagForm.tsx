'use client'

import { useActionState } from 'react'
import { renameTag } from '@/server/actions/tags'

export function TagForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(renameTag, {})
  return (
    <form className="adminTagForm" action={action} onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="id" value={name} />
      <label>
        Nama tag
        <input name="name" defaultValue={name} required maxLength={120} />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Menyimpan…' : 'Ganti nama'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  )
}
