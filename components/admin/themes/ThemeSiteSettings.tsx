import Link from 'next/link'

export const themeSiteSections = {
  general: 'Identitas dan logo',
  menus: 'Menu',
  footer: 'Footer',
  social: 'Tautan sosial',
  reading: 'Beranda dan membaca',
} as const
export type ThemeSiteSection = keyof typeof themeSiteSections
export function themeSiteSection(panel?: string): ThemeSiteSection | undefined {
  const section = panel?.startsWith('site-') ? panel.slice(5) : ''
  return Object.hasOwn(themeSiteSections, section) ? (section as ThemeSiteSection) : undefined
}

/** Same CMS-owned settings, edited within the selected theme's customizer. */
export function ThemeSiteSettings({
  themeId,
  section,
}: {
  themeId: string
  section?: ThemeSiteSection
}) {
  return (
    <nav className="siteEditorSettings" aria-label="Pengaturan situs">
      <Link href={`/admin/site-editor?theme=${themeId}`}>Desain tema</Link>
      {Object.entries(themeSiteSections).map(([key, label]) => (
        <Link
          key={key}
          href={`/admin/site-editor?theme=${themeId}&panel=site-${key}`}
          aria-current={section === key ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
