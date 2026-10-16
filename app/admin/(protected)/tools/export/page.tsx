import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { ExportView } from '@/components/admin/tools/ExportView'

const toolTabs = [
  { slug: '', label: 'Peralatan Tersedia' },
  { slug: 'import', label: 'Impor' },
  { slug: 'export', label: 'Ekspor' },
  { slug: 'health', label: 'Kesehatan Situs' },
]

export default async function ToolsExportPage() {
  await requireAdmin()

  return (
    <>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">PERALATAN SISTEM</p>
          <h1>Ekspor Konten</h1>
        </div>
      </div>

      <nav className="adminStatusTabs" aria-label="Menu Peralatan">
        {toolTabs.map((tab) => (
          <Link
            key={tab.slug}
            href={`/admin/tools${tab.slug ? `/${tab.slug}` : ''}`}
            aria-current={tab.slug === 'export' ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <ExportView />
    </>
  )
}
