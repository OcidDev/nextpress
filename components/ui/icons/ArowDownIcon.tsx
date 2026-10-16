import type { SVGProps } from 'react'

export function ArowDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line d", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g transform="translate(5.000000, 8.500000)"><path d="M14,0 C14,0 9.856,7 7,7 C4.145,7 0,0 0,0"/></g></svg>
  )
}
