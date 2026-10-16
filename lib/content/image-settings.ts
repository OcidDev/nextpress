export type ImageAlign = 'none' | 'left' | 'center' | 'right'
export type ImageDisplay = {
  align: ImageAlign
  width: number
  height: number
  alt: string
  caption: string
  href?: string
  newTab?: boolean
}
export function validImageLink(value: string) {
  return !value || (!/[\\\s]/.test(value) && /^(?:https?:\/\/|\/(?!\/)|#)/i.test(value))
}
export const imageAlignments = [
  { value: 'none', label: 'Tidak ada' },
  { value: 'left', label: 'Kiri' },
  { value: 'center', label: 'Tengah' },
  { value: 'right', label: 'Kanan' },
] as const
export function imageDimensions(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
export function imageAlignment(element: HTMLElement): ImageAlign {
  return (
    imageAlignments.find((item) => element.classList.contains(`align${item.value}`))?.value ??
    'none'
  )
}
