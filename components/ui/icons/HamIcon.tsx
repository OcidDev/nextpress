import type { SVGProps } from 'react'

export function HamIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="5" y2="5"/><line x1="3" x2="21" y1="19" y2="19"/></svg>
  )
}
