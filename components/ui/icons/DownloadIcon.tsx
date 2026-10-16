import type { SVGProps } from 'react'

export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g transform="translate(2.000000, 2.000000)"><line className="svgC" x1="9.8791" x2="9.8791" y1="12.791" y2="0.75"/><polyline className="svgC" points="12.7951 9.8642 9.8791 12.7922 6.9631 9.8642"/><path d="M14.3703,5.2587 C17.9493,5.5887 19.2503,6.9287 19.2503,12.2587 C19.2503,19.3587 16.9393,19.3587 10.0003,19.3587 C3.0593,19.3587 0.7503,19.3587 0.7503,12.2587 C0.7503,6.9287 2.0503,5.5887 5.6303,5.2587"/></g></svg>
  )
}
