import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { ImportView } from '@/components/admin/tools/ImportView'

const toolTabs = [
  { slug: '', label: 'Peralatan Tersedia' },
  { slug: 'import', label: 'Impor' },
  { slug: 'export', label: 'Ekspor' },
  { slug: 'health', label: 'Kesehatan Situs' },
]

export default async function ToolsImportPage() {
  await requireAdmin()

  return (
    <>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">PERALATAN SISTEM</p>
          <h1>Impor Konten</h1>
        </div>
      </div>

      <nav className="adminStatusTabs" aria-label="Menu Peralatan">
        {toolTabs.map((tab) => (
          <Link
            key={tab.slug}
            href={`/admin/tools${tab.slug ? `/${tab.slug}` : ''}`}
            aria-current={tab.slug === 'import' ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <ImportView />
    </>
  )
}
