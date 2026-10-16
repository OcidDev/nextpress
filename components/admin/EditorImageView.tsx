'use client'
/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { ImageDetailsDialog } from './ImageDetailsDialog'

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    left: 'M2 3h7v7H2z M12 3h6M12 7h6M2 14h16M2 18h12',
    center: 'M6 3h8v7H6z M2 14h16M4 18h12',
    right: 'M11 3h7v7h-7z M2 3h6M2 7h6M2 14h16M6 18h12',
    none: 'M2 3h16v7H2z M2 14h16M2 18h12',
    edit: 'm3 13 10-10 4 4L7 17l-5 1z M11 5l4 4',
    remove: 'm4 4 12 12M16 4 4 16',
  }
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d={paths[name]} />
    </svg>
  )
}

export function EditorImageView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
  extension,
}: NodeViewProps) {
  const attrs = node.attrs
  const [editing, setEditing] = useState(false)
  const [natural, setNatural] = useState({
    width: Number(attrs.width) || 300,
    height: Number(attrs.height) || 200,
  })
  const [resizing, setResizing] = useState<{ width: number; height: number } | null>(null)
  const resize = useRef<{
    x: number
    width: number
    ratio: number
    direction: number
    max: number
    next: { width: number; height: number }
  } | null>(null)
  const figure = useRef<HTMLElement>(null)
  function select() {
    const pos = getPos()
    if (typeof pos === 'number') editor.chain().focus().setNodeSelection(pos).run()
  }
  function resizeTo(width: number, max = 10000, ratio = natural.width / natural.height) {
    width = Math.max(24, Math.min(max, Math.round(width)))
    return { width, height: Math.max(1, Math.round(width / ratio)) }
  }
  function startResize(event: PointerEvent<HTMLButtonElement>, direction: number) {
    event.preventDefault()
    event.stopPropagation()
    select()
    const rect = figure.current?.querySelector('img')?.getBoundingClientRect()
    if (!rect) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = { width: Math.round(rect.width), height: Math.round(rect.height) }
    resize.current = {
      x: event.clientX,
      width: rect.width,
      ratio: rect.width / rect.height,
      direction,
      max: editor.view.dom.clientWidth - 32,
      next,
    }
    setResizing(next)
  }
  return (
    <NodeViewWrapper
      className={`editorImageNode align${attrs.align || 'none'}${selected ? ' isSelected' : ''}`}
      style={{ width: resizing?.width || Number(attrs.width) || natural.width, maxWidth: '100%' }}
      contentEditable={false}
    >
      <figure
        ref={figure}
        onClick={select}
        onDoubleClick={() => {
          select()
          setEditing(true)
        }}
      >
        <img
          data-drag-handle
          src={attrs.src}
          alt={attrs.alt || ''}
          title={attrs.title || undefined}
          width={resizing?.width || attrs.width || undefined}
          height={resizing?.height || attrs.height || undefined}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
        />
        {attrs.caption && <figcaption>{attrs.caption}</figcaption>}
      </figure>
      {selected && (
        <>
          <div
            className="editorImageToolbar"
            role="toolbar"
            aria-label="Kontrol gambar"
            onMouseDown={(event) => event.preventDefault()}
          >
            {(['left', 'center', 'right', 'none'] as const).map((align, index) => (
              <button
                type="button"
                key={align}
                aria-label={
                  [
                    'Gambar rata kiri',
                    'Gambar rata tengah',
                    'Gambar rata kanan',
                    'Gambar tanpa perataan',
                  ][index]
                }
                title={['Rata kiri', 'Rata tengah', 'Rata kanan', 'Tanpa perataan'][index]}
                aria-pressed={attrs.align === align}
                onClick={() => {
                  updateAttributes({ align })
                  select()
                }}
              >
                <Icon name={align} />
              </button>
            ))}
            <button
              type="button"
              aria-label="Edit gambar"
              title="Edit gambar"
              onClick={() => setEditing(true)}
            >
              <Icon name="edit" />
            </button>
            <button
              type="button"
              aria-label="Hapus gambar dari konten"
              title="Hapus gambar dari konten"
              onClick={() => {
                deleteNode()
                editor.commands.focus()
              }}
            >
              <Icon name="remove" />
            </button>
          </div>
          {(['left', 'right'] as const).map((corner) => (
            <button
              type="button"
              key={corner}
              className={`editorImageResize ${corner}`}
              aria-label={`Ubah ukuran gambar dari sudut ${corner === 'left' ? 'kiri' : 'kanan'}`}
              title="Tarik untuk mengubah ukuran; tombol panah untuk penyesuaian"
              onPointerDown={(event) => startResize(event, corner === 'left' ? -1 : 1)}
              onPointerMove={(event) => {
                if (!resize.current) return
                const state = resize.current
                state.next = resizeTo(
                  state.width + (event.clientX - state.x) * state.direction,
                  state.max,
                  state.ratio,
                )
                setResizing(state.next)
              }}
              onPointerUp={(event) => {
                if (!resize.current) return
                updateAttributes(resize.current.next)
                resize.current = null
                setResizing(null)
                event.currentTarget.releasePointerCapture(event.pointerId)
              }}
              onPointerCancel={() => {
                resize.current = null
                setResizing(null)
              }}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
                event.preventDefault()
                const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 10 : -10
                updateAttributes(resizeTo((Number(attrs.width) || natural.width) + delta))
              }}
            />
          ))}
          {resizing && (
            <output className="editorImageSize">
              {resizing.width} × {resizing.height}
            </output>
          )}
        </>
      )}
      {editing &&
        createPortal(
          <ImageDetailsDialog
            initial={{
              src: attrs.src,
              alt: attrs.alt || '',
              caption: attrs.caption || '',
              title: attrs.title || '',
              align: attrs.align || 'none',
              width: Number(attrs.width) || natural.width,
              height: Number(attrs.height) || natural.height,
              href: attrs.href || '',
              newTab: attrs.newTab || false,
            }}
            original={natural}
            canUpload={extension.options.canUpload}
            onClose={() => {
              setEditing(false)
              select()
            }}
            onApply={(value) => {
              updateAttributes(value)
              setEditing(false)
              select()
            }}
          />,
          document.body,
        )}
    </NodeViewWrapper>
  )
}
