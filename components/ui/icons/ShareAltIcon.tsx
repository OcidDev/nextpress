import type { SVGProps } from 'react'

export function ShareAltIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><path d="M92.30583,264.72053a3.42745,3.42745,0,0,1-.37,1.57,3.51,3.51,0,1,1,0-3.13995A3.42751,3.42751,0,0,1,92.30583,264.72053Z" transform="translate(-83.28571 -252.73452)"/><circle className="svgC" cx="18.48892" cy="5.49436" r="3.51099"/><circle className="svgC" cx="18.48892" cy="18.50564" r="3.51099"/><line className="cls-3" x1="12.53012" x2="8.65012" y1="8.476" y2="10.416"/><line className="cls-3" x1="12.53012" x2="8.65012" y1="15.496" y2="13.556"/></svg>
  )
}
