import type { SVGProps } from 'react'

export function PaperIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g transform="translate(3.649800, 2.749900)"><line className="svgC" x1="10.6555" x2="5.2555" y1="12.6999" y2="12.6999"/><line className="svgC" x1="8.6106" x2="5.2546" y1="8.6886" y2="8.6886"/><path d="M16.51,5.55 L10.84,0.15 C10.11,0.05 9.29,0 8.39,0 C2.1,0 -1.95399252e-14,2.32 -1.95399252e-14,9.25 C-1.95399252e-14,16.19 2.1,18.5 8.39,18.5 C14.69,18.5 16.79,16.19 16.79,9.25 C16.79,7.83 16.7,6.6 16.51,5.55 Z"/><path d="M10.2844,0.0827 L10.2844,2.7437 C10.2844,4.6017 11.7904,6.1067 13.6484,6.1067 L16.5994,6.1067"/></g></svg>
  )
}
