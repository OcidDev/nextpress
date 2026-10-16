import { requireAdmin } from '@/lib/admin'
import { listInstalledThemes } from '@/lib/themes/manager'
import { ThemeGallery } from '@/components/admin/themes/ThemeGallery'

export default async function AppearancePage() {
  await requireAdmin()
  const themes = await listInstalledThemes()

  return (
    <>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">TAMPILAN SITUS</p>
          <h1>Tema</h1>
        </div>
      </div>

      <ThemeGallery themes={themes} />
    </>
  )
}
