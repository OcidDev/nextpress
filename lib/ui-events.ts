export type SitePanel = 'menu' | 'search' | 'theme'

export function openPanel(panel: SitePanel) {
  window.dispatchEvent(new CustomEvent(`nextpress:open-${panel}`))
}
