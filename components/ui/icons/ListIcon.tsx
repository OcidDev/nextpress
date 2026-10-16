import type { SVGProps } from 'react'

export function ListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line className="svgC" x1="3" x2="3.01" y1="6" y2="6"/><line className="svgC" x1="3" x2="3.01" y1="12" y2="12"/><line className="svgC" x1="3" x2="3.01" y1="18" y2="18"/></svg>
  )
}
