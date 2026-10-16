import sanitizeHtml from 'sanitize-html'

export function cleanHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'h1',
      'h2',
      'h3',
      'figure',
      'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'class'],
      figure: ['class'],
      p: ['style'],
      h1: ['style'],
      h5: ['style'],
      h6: ['style'],
      code: ['class'],
      h2: ['id', 'style'],
      h3: ['id', 'style'],
      h4: ['id', 'style'],
    },
    allowedClasses: {
      img: ['alignnone', 'alignleft', 'aligncenter', 'alignright'],
      figure: ['cms-image', 'alignnone', 'alignleft', 'aligncenter', 'alignright'],
    },
    allowedStyles: { '*': { 'text-align': [/^(left|center|right|justify)$/] } },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => {
        const { target, ...rest } = attributes
        return {
          tagName: 'a',
          attribs: {
            ...rest,
            ...(target === '_blank' ? { target } : {}),
            rel: 'noopener noreferrer',
          },
        }
      },
      img: sanitizeHtml.simpleTransform('img', { loading: 'lazy', decoding: 'async' }),
      h2: safeHeading,
      h3: safeHeading,
      h4: safeHeading,
    },
  })
}
function safeHeading(tagName: string, attributes: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  return {
    tagName,
    attribs: {
      ...(attributes.id && /^section-[a-z0-9-]{1,90}$/.test(attributes.id)
        ? { id: attributes.id }
        : {}),
      ...(attributes.style ? { style: attributes.style } : {}),
    },
  }
}
export function plainText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()
}
export function wordCount(html: string) {
  return plainText(html).split(/\s+/).filter(Boolean).length
}
