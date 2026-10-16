'use client'

import { useSyncExternalStore } from 'react'

export const BOOKMARK_STORAGE_KEY = 'nextpress:bookmarks:v1'
const MAX_BOOKMARKS = 200
export type Bookmark = { id: string; slug: string; title: string; savedAt: string }
type Snapshot = { items: Bookmark[]; ready: boolean; persistent: boolean; message: string }
const initial: Snapshot = { items: [], ready: false, persistent: true, message: '' }
let snapshot = initial
let initialized = false
const listeners = new Set<() => void>()

function decode(value: string | null): Bookmark[] {
  if (!value) return []
  const document: unknown = JSON.parse(value)
  if (
    !document ||
    typeof document !== 'object' ||
    !('version' in document) ||
    document.version !== 1 ||
    !('items' in document) ||
    !Array.isArray(document.items)
  )
    return []
  const ids = new Set<string>()
  return document.items
    .filter((item): item is Bookmark => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        !/^[a-f0-9]{32}$/.test(item.id) ||
        ids.has(item.id) ||
        typeof item.slug !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
        item.slug.length > 200 ||
        typeof item.title !== 'string' ||
        item.title.length > 600 ||
        typeof item.savedAt !== 'string' ||
        !Number.isFinite(Date.parse(item.savedAt))
      )
        return false
      ids.add(item.id)
      return true
    })
    .slice(0, MAX_BOOKMARKS)
}
function emit() {
  listeners.forEach((listener) => listener())
}
function initialize() {
  if (initialized) return
  initialized = true
  try {
    snapshot = {
      items: decode(localStorage.getItem(BOOKMARK_STORAGE_KEY)),
      ready: true,
      persistent: true,
      message: '',
    }
  } catch {
    snapshot = {
      items: [],
      ready: true,
      persistent: false,
      message:
        'Penyimpanan browser tidak tersedia. Daftar bacaan hanya tersimpan selama halaman ini dibuka.',
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== BOOKMARK_STORAGE_KEY && event.key !== null) return
    try {
      snapshot = { ...snapshot, items: decode(event.newValue), message: '' }
      emit()
    } catch {
      /* Ignore an invalid document from another tab. */
    }
  })
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  initialize()
  listener()
  return () => {
    listeners.delete(listener)
  }
}
function update(items: Bookmark[]) {
  initialize()
  let persistent = true
  let message = ''
  try {
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify({ version: 1, items }))
  } catch {
    persistent = false
    message =
      'Penyimpanan browser tidak tersedia. Daftar bacaan hanya tersimpan selama halaman ini dibuka.'
  }
  snapshot = { items, ready: true, persistent, message }
  emit()
}
export function useBookmarks() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => initial,
  )
  return {
    ...state,
    toggle(post: { id: string; slug: string; title: string }) {
      initialize()
      if (snapshot.items.some((item) => item.id === post.id)) {
        update(snapshot.items.filter((item) => item.id !== post.id))
      } else if (snapshot.items.length >= MAX_BOOKMARKS) {
        snapshot = {
          ...snapshot,
          message: `Daftar bacaan penuh (${MAX_BOOKMARKS} artikel). Hapus artikel sebelum menambahkan yang baru.`,
        }
        emit()
      } else {
        update([
          { id: post.id, slug: post.slug, title: post.title, savedAt: new Date().toISOString() },
          ...snapshot.items,
        ])
      }
      return snapshot.message
    },
    remove(id: string) {
      update(snapshot.items.filter((item) => item.id !== id))
    },
    clear() {
      update([])
    },
  }
}
