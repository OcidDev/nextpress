'use client'

import { useActionState, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ActionState } from '@/lib/content/validation'
import { useUnsavedChanges } from './useUnsavedChanges'

// A save acknowledges only its submitted revision. Incoming server props never
// replace the local editing session or silently adopt another tab's version.
export function useEditorSave({
  initial,
  kind,
  save,
  onSaved,
  initialSuccess,
}: {
  initial: { id: string; slug: string; version: string; status?: string }
  kind: 'posts' | 'pages'
  save: (state: ActionState, data: FormData) => Promise<ActionState>
  onSaved: (saved: NonNullable<ActionState['saved']>, submitted: FormData) => void
  initialSuccess?: string
}) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const element = form.current
    // React's deferred onReset handler can run after the browser has already
    // reset controls. Intercept the native reset before it changes the DOM.
    const preserve = (event: Event) => event.preventDefault()
    element?.addEventListener('reset', preserve)
    return () => element?.removeEventListener('reset', preserve)
  }, [])
  const [record, setRecord] = useState(initial)
  const [navigating, setNavigating] = useState(false)
  const { dirty, setDirty } = useUnsavedChanges()
  const revision = useRef(0)
  const submittedRevision = useRef(0)
  const inFlight = useRef(false)
  const submitIntent = useRef('')
  const markDirty = useCallback(() => {
    revision.current += 1
    setDirty(true)
  }, [setDirty])
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (previous, data) => {
      try {
        if (submitIntent.current) data.set('intent', submitIntent.current)
        const result = await save(previous, data)
        if (result.saved) {
          setRecord({
            id: result.saved.id,
            slug: result.saved.slug,
            version: result.saved.version,
            status: result.saved.status,
          })
          onSaved(result.saved, data)
          const changedAfterSubmit = revision.current !== submittedRevision.current
          setDirty(changedAfterSubmit)
          // Crossing /new -> /id remounts the route on a subsequent action. Keep
          // this session at /new while it contains newer edits; every later save
          // still sends the acknowledged ID. Navigate only once all edits persist.
          if (!initial.id && !changedAfterSubmit) {
            setNavigating(true)
            router.replace(`/admin/${kind}/${result.saved.id}?saved=1`)
          }
        } else {
          setDirty(true)
        }
        return result
      } catch {
        setNavigating(false)
        setDirty(true)
        return { error: 'Perubahan gagal disimpan. Periksa koneksi, lalu coba kembali.' }
      } finally {
        inFlight.current = false
      }
    },
    { success: initialSuccess },
  )
  useEffect(() => {
    if (!dirty || pending || navigating || record.status !== 'draft') return
    const timer = window.setInterval(() => {
      const element = form.current
      if (!element || inFlight.current || !element.checkValidity()) return
      // Never turn a published article into a draft or publish a selected status automatically.
      if (new FormData(element).get('status') !== 'draft') return
      element.requestSubmit()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [dirty, pending, navigating, record.status])
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending || inFlight.current) {
      event.preventDefault()
      return
    }
    inFlight.current = true
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    submitIntent.current =
      submitter instanceof HTMLButtonElement && submitter.name === 'intent' ? submitter.value : ''
    submittedRevision.current = revision.current
    // Retain navigation protection throughout the request, including new forms.
    setDirty(true)
  }
  return {
    form,
    state,
    action,
    pending: pending || navigating,
    navigating,
    dirty,
    markDirty,
    onSubmit,
    record,
  }
}
