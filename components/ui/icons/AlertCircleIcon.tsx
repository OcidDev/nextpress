import type { SVGProps } from 'react'

export function AlertCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><line className="svgC" x1="12" x2="12" y1="8" y2="12"/><line className="svgC" x1="12" x2="12.01" y1="16" y2="16"/></svg>
  )
}
