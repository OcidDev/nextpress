import type { SVGProps } from 'react'

export function DownloadAltIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><polyline className="svgC" points="8 17 12 21 16 17"/><line className="svgC" x1="12" x2="12" y1="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>
  )
}
