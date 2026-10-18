export function xmlCdata(value: string) {
  return `<![CDATA[${value.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`
}

export function xmlText(value: string) {
  return [...value.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g)]
    .map((part) => {
      if (part[1] !== undefined) return part[1]
      return (part[2] || '').replace(
        /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
        (entity, name: string) => {
          const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
          if (!name.startsWith('#')) return named[name] ?? entity
          const code =
            name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
          return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
            ? String.fromCodePoint(code)
            : '\ufffd'
        },
      )
    })
    .join('')
}
