import type { KeyboardEvent } from 'react'

export function editorSaveShortcut(event: KeyboardEvent<HTMLFormElement>, pending: boolean) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's' || event.altKey) return
  event.preventDefault()
  if (
    pending ||
    (event.target instanceof Element && event.target.closest('[role="dialog"], .editorLinkPanel'))
  )
    return
  event.currentTarget.requestSubmit()
}
