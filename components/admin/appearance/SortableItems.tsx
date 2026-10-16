'use client'

import { useState, type ReactNode } from 'react'
import { ArowDownIcon, ArowUpIcon, DeleteIcon, ListIcon, PlusIcon } from '@/components/ui/icons'

type ArrangementItem = { id: string; enabled: boolean }

export function SortableItems<T extends ArrangementItem>({
  items,
  onChange,
  labelFor,
  renderFields,
  disabled = false,
  canDuplicate = () => true,
  emptyText = 'Belum ada bagian. Tambahkan bagian untuk mulai menyusun tampilan.',
}: {
  items: T[]
  onChange: (next: T[]) => void
  labelFor: (item: T) => string
  renderFields: (item: T, update: (next: T) => void) => ReactNode
  disabled?: boolean
  canDuplicate?: (item: T) => boolean
  emptyText?: string
}) {
  const [expanded, setExpanded] = useState<string | null>(items[0]?.id ?? null)
  const [dragging, setDragging] = useState<string | null>(null)

  function move(id: string, targetIndex: number) {
    const next = [...items]
    const index = next.findIndex((item) => item.id === id)
    if (index < 0 || targetIndex < 0 || targetIndex >= next.length || index === targetIndex) return
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item!)
    onChange(next)
  }

  function update(id: string, next: T) {
    onChange(items.map((item) => (item.id === id ? next : item)))
  }

  function duplicate(item: T, index: number) {
    const copy = { ...structuredClone(item), id: crypto.randomUUID() }
    const next = [...items]
    next.splice(index + 1, 0, copy)
    onChange(next)
    setExpanded(copy.id)
  }

  return (
    <div className="appearanceItemList">
      {items.length === 0 && <p className="appearanceEmpty">{emptyText}</p>}
      {items.map((item, index) => {
        const label = labelFor(item)
        const open = expanded === item.id
        return (
          <article
            className={`appearanceItem${!item.enabled ? ' appearanceItemDisabled' : ''}${dragging === item.id ? ' appearanceItemDragging' : ''}`}
            key={item.id}
            aria-label={label}
            onDragOver={(event) => {
              if (dragging && !disabled) event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (dragging && !disabled) move(dragging, index)
              setDragging(null)
            }}
          >
            <header className="appearanceItemHeader">
              <button
                type="button"
                className="appearanceDragHandle"
                draggable={!disabled}
                disabled={disabled}
                aria-label={`Geser ${label}`}
                title="Geser untuk mengurutkan; tombol panah juga tersedia"
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', item.id)
                  event.dataTransfer.effectAllowed = 'move'
                  setDragging(item.id)
                }}
                onDragEnd={() => setDragging(null)}
              >
                <ListIcon aria-hidden="true" />
              </button>
              <button
                type="button"
                className="appearanceItemToggle"
                aria-expanded={open}
                aria-controls={`appearance-item-${item.id}`}
                onClick={() => setExpanded(open ? null : item.id)}
              >
                <strong>{label}</strong>
                {!item.enabled && <span>Disembunyikan</span>}
              </button>
              <div className="appearanceItemActions">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  aria-label={`Pindahkan ${label} ke atas`}
                  title="Pindah ke atas"
                  onClick={() => move(item.id, index - 1)}
                >
                  <ArowUpIcon aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={disabled || index === items.length - 1}
                  aria-label={`Pindahkan ${label} ke bawah`}
                  title="Pindah ke bawah"
                  onClick={() => move(item.id, index + 1)}
                >
                  <ArowDownIcon aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={disabled || !canDuplicate(item)}
                  aria-label={`Duplikasikan ${label}`}
                  title="Duplikasikan"
                  onClick={() => duplicate(item, index)}
                >
                  <PlusIcon aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Hapus ${label}`}
                  title="Hapus"
                  onClick={() => {
                    if (window.confirm(`Hapus ${label} dari rancangan?`))
                      onChange(items.filter((value) => value.id !== item.id))
                  }}
                >
                  <DeleteIcon aria-hidden="true" />
                </button>
              </div>
            </header>
            <div
              className="appearanceItemFields adminForm"
              id={`appearance-item-${item.id}`}
              hidden={!open}
            >
              <label className="appearanceCheckbox">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  disabled={disabled}
                  onChange={(event) => update(item.id, { ...item, enabled: event.target.checked })}
                />
                Tampilkan bagian ini
              </label>
              <fieldset disabled={disabled}>
                {renderFields(item, (next) => update(item.id, next))}
              </fieldset>
            </div>
          </article>
        )
      })}
    </div>
  )
}
