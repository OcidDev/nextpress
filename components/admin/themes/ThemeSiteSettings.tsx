import Link from 'next/link'

/** Site identity belongs to the CMS and survives switching or deleting themes. */
export function ThemeSiteSettings() {
  return (
    <nav className="siteEditorSettings" aria-label="Pengaturan situs">
      <span>Pengaturan situs</span>
      <Link href="/admin/settings/general">Identitas dan logo</Link>
      <Link href="/admin/settings/menus">Menu</Link>
      <Link href="/admin/settings/footer">Footer</Link>
      <Link href="/admin/settings/social">Tautan sosial</Link>
    </nav>
  )
}
