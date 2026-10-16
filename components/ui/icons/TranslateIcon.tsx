import type { SVGProps } from 'react'

export function TranslateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><path d="M.5,2V18A1.5,1.5,0,0,0,2,19.5H17L10.5.5H2A1.5,1.5,0,0,0,.5,2Z"/><path d="M12,4.5H22A1.5,1.5,0,0,1,23.5,6V22A1.5,1.5,0,0,1,22,23.5H13.5l-1.5-4"/><line x1="17" x2="13.5" y1="19.5" y2="23.5"/><line className="svgC" x1="14.5" x2="21.5" y1="10.5" y2="10.5"/><line className="svgC" x1="17.5" x2="17.5" y1="9.5" y2="10.5"/><path className="svgC" d="M20,10.5c0,1.1-1.77,4.42-4,6"/><path className="svgC" d="M16,13c.54,1.33,4,4.5,4,4.5"/><path className="svgC" d="M10.1,7.46a4,4,0,1,0,1.4,3h-4"/></svg>
  )
}
