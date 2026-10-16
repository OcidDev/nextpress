import type { SVGProps } from 'react'

export function CloudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><line x1="10" x2="10" y1="5" y2="4"/><line x1="6.79" x2="6.14" y1="6.17" y2="5.4"/><line x1="5.08" x2="4.09" y1="9.13" y2="8.96"/><line x1="5.67" x2="4.8" y1="12.5" y2="13"/><line x1="13.21" x2="13.86" y1="6.17" y2="5.4"/><path d="M7.46,12.41A3.5,3.5,0,1,1,13,8.19l.08.12"/><path d="M16,15h4a1,1,0,0,0,1-1h0a3,3,0,0,0-3-3H18a3.48,3.48,0,0,0-6.92.19A2.94,2.94,0,0,0,10,11a3,3,0,0,0-3,3v1"/><line x1="13" x2="20" y1="17" y2="17"/><line x1="15" x2="18" y1="19" y2="19"/><line x1="10" x2="13" y1="19" y2="19"/><line x1="9" x2="13" y1="15" y2="15"/><line x1="8" x2="11" y1="17" y2="17"/></svg>
  )
}
