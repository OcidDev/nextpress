'use client'

import { useActionState, useRef } from 'react'
import { manageTrashedContent } from '@/server/actions/content'

export function TrashActions({ kind, id }: { kind: 'posts' | 'pages'; id: string }) {
  const operation = useRef('restore')
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof manageTrashedContent>[0], data: FormData) => {
      data.set('operation', operation.current)
      return manageTrashedContent(previous, data)
    },
    {},
  )
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        operation.current = button?.value === 'delete' ? 'delete' : 'restore'
        if (
          button?.value === 'delete' &&
          !window.confirm(
            'Hapus permanen beserta riwayat revisinya? Tindakan ini tidak dapat dibatalkan.',
          )
        )
          event.preventDefault()
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button name="operation" value="restore" disabled={pending}>
        Pulihkan sebagai draft
      </button>
      <button name="operation" value="delete" disabled={pending}>
        Hapus permanen
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  )
}
