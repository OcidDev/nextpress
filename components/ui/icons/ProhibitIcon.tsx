import type { SVGProps } from 'react'

export function ProhibitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>
  )
}
