import type { SVGProps } from 'react'

export function EditAltIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g transform="translate(3.500000, 3.500000)"><line className="svgC" x1="9.8352" x2="16.2122" y1="16.0078" y2="16.0078"/><path d="M12.5578,1.3589 L12.5578,1.3589 C11.2138,0.3509 9.3078,0.6229 8.2998,1.9659 C8.2998,1.9659 3.2868,8.6439 1.5478,10.9609 C-0.1912,13.2789 1.4538,16.1509 1.4538,16.1509 C1.4538,16.1509 4.6978,16.8969 6.4118,14.6119 C8.1268,12.3279 13.1638,5.6169 13.1638,5.6169 C14.1718,4.2739 13.9008,2.3669 12.5578,1.3589 Z"/><line x1="7.0041" x2="11.8681" y1="3.7114" y2="7.3624"/></g></svg>
  )
}
