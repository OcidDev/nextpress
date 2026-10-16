import type { SVGProps } from 'react'

export function ShieldDoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g transform="translate(3.500000, 2.000000)"><path d="M8.4845,19.6057 C10.8195,19.6057 16.1565,17.2837 16.1565,10.8787 C16.1565,4.4747 16.4345,3.9737 15.8195,3.3577 C15.2035,2.7417 11.9935,0.7507 8.4845,0.7507 C4.9755,0.7507 1.7655,2.7417 1.1505,3.3577 C0.5345,3.9737 0.8125,4.4747 0.8125,10.8787 C0.8125,17.2837 6.1505,19.6057 8.4845,19.6057 Z"/><polyline className="svgC" points="5.8859 9.8748 7.7779 11.7698 11.6759 7.8698"/></g></svg>
  )
}
