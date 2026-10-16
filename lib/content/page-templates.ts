/**
 * Page templates shipped by the built-in site design.
 *
 * The list used to come from the active theme package. The design is now fixed,
 * so the choices are a constant; `pages.page_template` still stores one of these
 * values (or `default`).
 */
export const pageTemplateChoices = [
  { value: 'page-no-title', label: 'Laman tanpa judul' },
  { value: 'page-with-sidebar', label: 'Laman dengan bilah sisi' },
  { value: 'page-wide', label: 'Laman lebar' },
] as const

export type PageTemplateValue = (typeof pageTemplateChoices)[number]['value']

const values: readonly string[] = pageTemplateChoices.map((choice) => choice.value)

export function isPageTemplate(value: string): value is PageTemplateValue {
  return values.includes(value)
}
