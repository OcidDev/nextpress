import type { SVGProps } from 'react'

export function StatsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g transform="translate(2.300000, 2.300000)"><line className="svgC" x1="5.18305279" x2="5.18305279" y1="7.960947" y2="14.6546312"/><line className="svgC" x1="9.73684179" x2="9.73684179" y1="4.757368" y2="14.6552627"/><line className="svgC" x1="14.2156838" x2="14.2156838" y1="11.498211" y2="14.6550531"/><path d="M-3.55271368e-14,9.73684211 C-3.55271368e-14,2.43473684 2.43473684,2.13162821e-14 9.73684211,2.13162821e-14 C17.0389474,2.13162821e-14 19.4736842,2.43473684 19.4736842,9.73684211 C19.4736842,17.0389474 17.0389474,19.4736842 9.73684211,19.4736842 C2.43473684,19.4736842 -3.55271368e-14,17.0389474 -3.55271368e-14,9.73684211 Z"/></g></svg>
  )
}
