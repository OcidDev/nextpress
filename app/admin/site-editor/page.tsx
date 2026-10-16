import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/admin'
import { getActiveThemeId, getThemePackage } from '@/lib/themes/manager'
import { getThemeCustomizationState } from '@/lib/themes/customization-server'
import { getAppearanceEditor } from '@/lib/db/queries/appearance'
import { ThemeCustomizer } from '@/components/admin/themes/ThemeCustomizer'
import { AppearanceEditor } from '@/components/admin/AppearanceEditor'
import './site-editor.css'

export default async function SiteEditor({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>
}) {
  await requireCapability('edit_theme_options')
  const activeId = await getActiveThemeId()
  const theme = await getThemePackage((await searchParams).theme || activeId)
  if (!theme) notFound()
  const active = theme.manifest.id === activeId
  return (
    <main className="siteEditor" aria-label="Editor desain situs">
      <header className="siteEditorHeader">
        <Link href="/admin/appearance" aria-label="Kembali ke tema">
          ← Tema
        </Link>
        <div>
          <h1>Sesuaikan {theme.manifest.name}</h1>
          <span>{active ? 'Tema aktif' : 'Tema belum aktif · rancangan privat'}</span>
        </div>
        <Link href="/" target="_blank">
          Lihat situs ↗
        </Link>
      </header>
      {theme.customization ? (
        <ThemeCustomizer
          themeId={theme.manifest.id}
          name={theme.manifest.name}
          hash={theme.hash}
          config={theme.customization}
          initial={await getThemeCustomizationState(theme.manifest.id)}
          activeThemeId={activeId}
          isActive={active}
        />
      ) : theme.manifest.capabilities.includes('appearance-editor') ? (
        <AppearanceEditor editor={await getAppearanceEditor()} standalone isActive={active} />
      ) : (
        <div className="siteEditorEmpty">
          <h2>Desain</h2>
          <p>Tema ini belum menyediakan kontrol penyesuaian.</p>
          <Link href="/admin/settings/general">Identitas situs</Link>
        </div>
      )}
    </main>
  )
}
