import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/admin'
import { getActiveThemeId, getThemeForEditor } from '@/lib/themes/manager'
import { getThemeCustomizationState } from '@/lib/themes/customization-server'
import { ThemeCustomizer } from '@/components/admin/themes/ThemeCustomizer'
import { ThemeSiteSettings } from '@/components/admin/themes/ThemeSiteSettings'
import './site-editor.css'

export default async function SiteEditor({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>
}) {
  await requireCapability('edit_theme_options')
  const activeId = await getActiveThemeId()
  const theme = await getThemeForEditor((await searchParams).theme || activeId)
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
      <ThemeSiteSettings />
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
      ) : (
        <div className="siteEditorEmpty">
          <h2>Desain</h2>
          <p>
            Gunakan pengaturan situs di atas untuk mengubah identitas, menu, dan footer. Tema ini
            belum menyediakan kontrol warna atau tata letak tambahan.
          </p>
          <iframe
            title={`Pratinjau ${theme.manifest.name}`}
            src={`/preview/theme/${theme.manifest.id}`}
            style={{ width: '100%', height: '65vh', border: 0 }}
          />
        </div>
      )}
    </main>
  )
}
