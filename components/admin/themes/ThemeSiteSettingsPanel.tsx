import { createHash } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { getSettings } from '@/lib/db/queries/settings'
import { SiteSettingsPanel } from '@/components/admin/SiteSettingsPanel'
import { themeSiteSections, type ThemeSiteSection } from './ThemeSiteSettings'

export async function ThemeSiteSettingsPanel({
  themeId,
  section,
}: {
  themeId: string
  section: ThemeSiteSection
}) {
  await requireAdmin()
  const settings = await getSettings()
  // Revalidation after saving reloads the preview, preserving form success feedback.
  const revision = createHash('sha256').update(JSON.stringify(settings)).digest('hex')
  return (
    <div className="siteSettingsWorkspace">
      <section className="siteSettingsControls" aria-label={themeSiteSections[section]}>
        <h2>{themeSiteSections[section]}</h2>
        <p className="siteSettingsNotice">
          Pengaturan ini berlaku untuk seluruh situs, termasuk saat berganti tema. Simpan untuk
          langsung menerapkannya ke situs publik.
        </p>
        <SiteSettingsPanel key={section} section={section} />
      </section>
      <section className="siteSettingsPreview" aria-label="Pratinjau pengaturan situs">
        <p>Pratinjau diperbarui setelah pengaturan disimpan.</p>
        <iframe
          key={revision}
          title="Pratinjau pengaturan situs"
          src={`/preview/theme/${themeId}`}
        />
      </section>
    </div>
  )
}
