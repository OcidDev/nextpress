import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { imageAlignment } from '@/lib/content/image-settings'
import { EditorImageView } from './EditorImageView'

// Controls are a node view only. Saved HTML contains the image, link and caption.
export const EditorImage = Image.extend<{ allowBase64: boolean; canUpload: boolean }>({
  marks: '',
  addOptions() {
    return { ...this.parent?.(), allowBase64: false, canUpload: true }
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      loading: { default: 'lazy' },
      decoding: { default: 'async' },
      align: { default: 'none', parseHTML: (element) => imageAlignment(element), rendered: false },
      caption: { default: '', rendered: false },
      href: { default: '', rendered: false },
      newTab: { default: false, rendered: false },
    }
  },
  parseHTML() {
    function imageAttrs(element: HTMLElement) {
      const img = element.querySelector('img')
      if (!img) return false
      const link = element.tagName === 'A' ? element : element.querySelector('a')
      return {
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        title: img.getAttribute('title'),
        width: Number(img.getAttribute('width')) || null,
        height: Number(img.getAttribute('height')) || null,
        align: imageAlignment(element.tagName === 'A' ? img : element),
        caption: element.querySelector('figcaption')?.textContent || '',
        href: link?.getAttribute('href') || '',
        newTab: link?.getAttribute('target') === '_blank',
      }
    }
    return [
      { tag: 'figure.cms-image', priority: 100, getAttrs: imageAttrs },
      {
        tag: 'a[href]',
        priority: 100,
        getAttrs: (element) =>
          element.childNodes.length === 1 && element.firstElementChild?.tagName === 'IMG'
            ? imageAttrs(element)
            : false,
      },
      { tag: 'img[src]' },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const attrs = { ...HTMLAttributes, class: `align${node.attrs.align}` }
    if (!node.attrs.caption && !node.attrs.href) return ['img', attrs]
    const img: DOMOutputSpec = ['img', HTMLAttributes]
    const visual: DOMOutputSpec = node.attrs.href
      ? [
          'a',
          {
            href: node.attrs.href,
            ...(node.attrs.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          },
          img,
        ]
      : img
    return [
      'figure',
      { class: `cms-image align${node.attrs.align}` },
      visual,
      ...(node.attrs.caption ? [['figcaption', {}, node.attrs.caption] as DOMOutputSpec] : []),
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditorImageView)
  },
})
