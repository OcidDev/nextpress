export type SitePanel = 'menu' | 'search'

export function openPanel(panel: SitePanel) {
  window.dispatchEvent(new CustomEvent(`nextpress:open-${panel}`))
}
