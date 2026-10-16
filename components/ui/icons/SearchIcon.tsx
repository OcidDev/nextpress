import type { SVGProps } from 'react'

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g><circle cx="11.36167" cy="11.36167" r="9.36167"/><line className="svgC" x1="22" x2="19.9332" y1="22" y2="19.9332"/></g></svg>
  )
}
