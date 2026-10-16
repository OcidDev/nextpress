'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { EditorImage } from './EditorImage'
import { useEditorState } from '@tiptap/react'
import { MediaPicker } from './MediaPicker'

// Unsupported legacy markup stays in HTML mode instead of being silently discarded.
function supportsVisual(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  if (document.head.children.length) return false
  const supported = new Set([
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'del',
    'br',
    'hr',
    'a',
    'img',
    'figure',
    'figcaption',
  ])
  for (const element of document.body.querySelectorAll('*')) {
    const tag = element.tagName.toLowerCase()
    if (!supported.has(tag)) return false
    const attributes =
      tag === 'a'
        ? ['href', 'target', 'rel']
        : tag === 'img'
          ? ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'class']
          : tag === 'figure'
            ? ['class']
            : /^(p|h[1-6])$/.test(tag)
              ? ['style']
              : tag === 'ol'
                ? ['start']
                : tag === 'code'
                  ? ['class']
                  : []
    if ([...element.attributes].some((attribute) => !attributes.includes(attribute.name)))
      return false
    if (
      element.hasAttribute('style') &&
      !/^text-align:\s*(left|center|right|justify);?\s*$/.test(element.getAttribute('style') || '')
    )
      return false
    if (
      (tag === 'figure' || tag === 'img') &&
      element.hasAttribute('class') &&
      !/^(?:(?:cms-image|alignnone|alignleft|aligncenter|alignright)\s*)+$/.test(element.className)
    )
      return false
    if (
      tag === 'figure' &&
      (!element.classList.contains('cms-image') ||
        element.children.length > 2 ||
        !element.querySelector(':scope > img, :scope > a > img') ||
        (element.children[1] && element.children[1].tagName !== 'FIGCAPTION') ||
        element.querySelector('figcaption')?.children.length)
    )
      return false
    if (
      tag === 'figure' &&
      [...element.childNodes].some(
        (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim(),
      )
    )
      return false
    if (
      tag === 'a' &&
      element.querySelector('img') &&
      (element.childNodes.length !== 1 || element.firstElementChild?.tagName !== 'IMG')
    )
      return false
    if (tag === 'figcaption' && !element.parentElement?.classList.contains('cms-image'))
      return false
    if (tag === 'img' && !validImageUrl(element.getAttribute('src') || '')) return false
    if (tag === 'a' && !validLinkUrl(element.getAttribute('href') || '')) return false
    if (
      tag === 'code' &&
      element.hasAttribute('class') &&
      (element.parentElement?.tagName !== 'PRE' ||
        !/^language-\S+$/.test(element.getAttribute('class') || ''))
    )
      return false
  }
  return true
}

function validLinkUrl(value: string) {
  return !value || (!/[\\\s]/.test(value) && /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value))
}
function validImageUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^\/api\/media\/[a-f0-9]{32}$/.test(value)
}

export function HtmlEditor({
  content = '',
  canUpload = true,
  onChange,
}: {
  content?: string
  canUpload?: boolean
  onChange?: () => void
}) {
  const id = useId()
  const [html, setHtml] = useState(content)
  const [mode, setMode] = useState<'visual' | 'html'>('visual')
  const [ready, setReady] = useState(false)
  const [compatible, setCompatible] = useState(true)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false, autolink: false, linkOnPaste: false },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      EditorImage.configure({ allowBase64: false, canUpload }),
    ],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Isi artikel (visual)',
        'aria-multiline': 'true',
        class: 'richTextContent',
      },
    },
    onUpdate({ editor: current }) {
      setHtml(current.getHTML())
      onChangeRef.current?.()
    },
  })
  const selection = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      image: current?.isActive('image') ? current.getAttributes('image') : null,
      position: current?.state.selection.from,
      align:
        ['left', 'center', 'right', 'justify'].find((textAlign) =>
          current?.isActive({ textAlign }),
        ) || 'left',
      active: current?.state.selection.to,
    }),
  })
  useEffect(() => {
    if (!editor) return
    const supported = supportsVisual(content)
    setHtml(content)
    setCompatible(supported)
    setMode(supported ? 'visual' : 'html')
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent(supported ? content : '', { emitUpdate: false })
      .run()
    setReady(true)
  }, [content, editor])
  function switchMode(next: 'visual' | 'html') {
    if (next === 'visual') {
      const supported = supportsVisual(html)
      setCompatible(supported)
      if (!supported) return
      editor?.commands.setContent(html, { emitUpdate: false })
    }
    setMode(next)
    setLinkOpen(false)
  }
  const words = html
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return (
    <section className="richTextEditor" aria-label="Editor isi">
      <input type="hidden" name="content" value={html} />
      <div className="editorModeBar">
        {canUpload && mode === 'visual' ? (
          <MediaPicker
            label="Tambah Media"
            onOpen={() => {
              editor?.commands.focus()
            }}
            displaySettings
            onSelect={(media, display) =>
              editor
                ?.chain()
                .focus()
                .insertContent({
                  type: 'image',
                  attrs: { src: `/api/media/${media.id}`, alt: media.alt, ...display },
                })
                .run()
            }
          />
        ) : (
          <strong>Isi konten</strong>
        )}

        <div className="adminActions" aria-label="Mode editor">
          <button
            type="button"
            aria-pressed={mode === 'visual'}
            onClick={() => switchMode('visual')}
          >
            Visual
          </button>
          <button type="button" aria-pressed={mode === 'html'} onClick={() => switchMode('html')}>
            HTML
          </button>
        </div>
      </div>
      {!compatible && (
        <p className="adminNotice">
          Konten ini memakai markup yang belum didukung editor visual. Edit melalui HTML untuk
          mempertahankan seluruh tata letak.
        </p>
      )}
      {mode === 'visual' ? (
        <>
          <div className="editorToolbar" role="toolbar" aria-label="Format isi">
            <label className="editorFormatSelect">
              <span className="srOnly">Format paragraf</span>
              <select
                aria-label="Format paragraf"
                disabled={!editor || !ready}
                value={
                  editor?.isActive('heading') ? String(editor.getAttributes('heading').level) : 'p'
                }
                onChange={(event) => {
                  if (event.target.value === 'p') editor?.chain().focus().setParagraph().run()
                  else
                    editor
                      ?.chain()
                      .focus()
                      .toggleHeading({ level: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6 })
                      .run()
                }}
              >
                <option value="p">Paragraf</option>
                <option value="1">Judul 1</option>
                <option value="2">Judul 2</option>
                <option value="3">Judul 3</option>
                <option value="4">Judul 4</option>
                <option value="5">Judul 5</option>
                <option value="6">Judul 6</option>
              </select>
            </label>
            {[
              {
                label: 'Tebal',
                active: 'bold',
                run: () => editor?.chain().focus().toggleBold().run(),
              },
              {
                label: 'Miring',
                active: 'italic',
                run: () => editor?.chain().focus().toggleItalic().run(),
              },
              {
                label: 'Daftar',
                active: 'bulletList',
                run: () => editor?.chain().focus().toggleBulletList().run(),
              },
              {
                label: 'Penomoran',
                active: 'orderedList',
                run: () => editor?.chain().focus().toggleOrderedList().run(),
              },
              {
                label: 'Kutipan',
                active: 'blockquote',
                run: () => editor?.chain().focus().toggleBlockquote().run(),
              },
              {
                label: 'Kode',
                active: 'codeBlock',
                run: () => editor?.chain().focus().toggleCodeBlock().run(),
              },
            ].map((item) => (
              <button
                type="button"
                key={item.active}
                disabled={!editor || !ready}
                aria-pressed={editor?.isActive(item.active) || false}
                onClick={item.run}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              disabled={!editor || !ready}
              aria-pressed={editor?.isActive('link') || false}
              onClick={() => {
                setLinkUrl(String(editor?.getAttributes('link').href || ''))
                setLinkError('')
                setLinkOpen(!linkOpen)
              }}
            >
              Tautan
            </button>
            {(['left', 'center', 'right', 'justify'] as const).map((align, index) => (
              <button
                type="button"
                key={align}
                disabled={!editor || !ready || !!selection?.image}
                aria-label={['Rata kiri', 'Rata tengah', 'Rata kanan', 'Rata kiri kanan'][index]}
                title={['Rata kiri', 'Rata tengah', 'Rata kanan', 'Rata kiri kanan'][index]}
                aria-pressed={selection?.align === align}
                onClick={() => editor?.chain().focus().setTextAlign(align).run()}
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path
                    d={
                      align === 'left'
                        ? 'M2 4h16M2 8h10M2 12h16M2 16h10'
                        : align === 'right'
                          ? 'M2 4h16M8 8h10M2 12h16M8 16h10'
                          : align === 'center'
                            ? 'M2 4h16M5 8h10M2 12h16M5 16h10'
                            : 'M2 4h16M2 8h16M2 12h16M2 16h16'
                    }
                  />
                </svg>
              </button>
            ))}
            <button
              type="button"
              disabled={!editor?.can().undo()}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              Urungkan
            </button>
            <button
              type="button"
              disabled={!editor?.can().redo()}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              Ulangi
            </button>
          </div>
          {linkOpen && (
            <div className="editorLinkPanel adminActions">
              <label htmlFor={`${id}-link`}>URL tautan</label>
              <input
                id={`${id}-link`}
                value={linkUrl}
                maxLength={2000}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  const href = linkUrl.trim()
                  if (!validLinkUrl(href)) {
                    setLinkError('Gunakan URL http(s), email, atau tautan halaman situs.')
                    return
                  }
                  const chain = editor?.chain().focus().extendMarkRange('link')
                  if (href) chain?.setLink({ href }).run()
                  else chain?.unsetLink().run()
                  setLinkOpen(false)
                }}
              >
                Terapkan tautan
              </button>
              <button
                type="button"
                onClick={() => {
                  editor?.chain().focus().unsetLink().run()
                  setLinkOpen(false)
                }}
              >
                Hapus tautan
              </button>
              {linkError && <p role="alert">{linkError}</p>}
            </div>
          )}
          {!ready && <p>Memuat editor…</p>}
          <EditorContent editor={editor} />
        </>
      ) : (
        <label htmlFor={`${id}-html`}>
          Isi artikel (HTML)
          <textarea
            id={`${id}-html`}
            className="editorHtmlSource"
            value={html}
            maxLength={500000}
            onChange={(event) => {
              setHtml(event.target.value)
              onChange?.()
            }}
          />
        </label>
      )}
      <small className="editorFooter">{words} kata · HTML dibersihkan saat disimpan.</small>
    </section>
  )
}
