import type { SVGProps } from 'react'

export function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={["line", props.className].filter(Boolean).join(" ")} viewBox="0 0 24 24"><g transform="translate(12.000000, 12.000000) rotate(-90.000000) translate(-12.000000, -12.000000) translate(5.500000, 4.000000)"><line x1="6.7743" x2="6.7743" y1="15.7501" y2="0.7501"/><path d="M12.7988,9.6998 C12.7988,9.6998 9.5378,15.7498 6.7758,15.7498 C4.0118,15.7498 0.7498,9.6998 0.7498,9.6998"/></g></svg>
  )
}
