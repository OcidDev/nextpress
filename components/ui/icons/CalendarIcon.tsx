import type { SVGProps } from 'react'

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g transform="translate(2.749800, 2.050100)"><path d="M-1.0658141e-14,10.7255 C-1.0658141e-14,3.7695 2.319,1.4515 9.274,1.4515 C16.23,1.4515 18.549,3.7695 18.549,10.7255 C18.549,17.6815 16.23,19.9995 9.274,19.9995 C2.319,19.9995 -1.0658141e-14,17.6815 -1.0658141e-14,10.7255 Z"/><line x1="0.2754" x2="18.2834" y1="7.2739" y2="7.2739"/><line x1="13.2832" x2="13.2832" y1="2.84217094e-14" y2="3.262"/><line x1="5.2749" x2="5.2749" y1="2.84217094e-14" y2="3.262"/></g></svg>
  )
}
