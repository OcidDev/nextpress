'use client'

import { useActionState } from 'react'
import { restoreContentRevision } from '@/server/actions/content-history'

export function RestoreRevisionForm({
  kind,
  id,
  revision,
  version,
  published,
}: {
  kind: 'posts' | 'pages'
  id: string
  revision: string
  version: string
  published: boolean
}) {
  const [state, action, pending] = useActionState(restoreContentRevision, {})
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            published
              ? 'Pulihkan revisi ini? Konten yang sudah terbit akan langsung diperbarui.'
              : 'Pulihkan revisi ini? Versi sekarang tetap disimpan dalam riwayat.',
          )
        )
          event.preventDefault()
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="version" value={version} />
      <button className="button" disabled={pending}>
        {pending ? 'Memulihkan…' : 'Pulihkan revisi ini'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  )
}
