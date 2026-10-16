import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { getSiteHealthReportData } from '@/lib/db/queries/tools'
import { SiteHealthView } from '@/components/admin/tools/SiteHealthView'

const toolTabs = [
  { slug: '', label: 'Peralatan Tersedia' },
  { slug: 'import', label: 'Impor' },
  { slug: 'export', label: 'Ekspor' },
  { slug: 'health', label: 'Kesehatan Situs' },
]

export default async function ToolsHealthPage() {
  await requireAdmin()
  const report = await getSiteHealthReportData()

  return (
    <>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">PERALATAN SISTEM</p>
          <h1>Kesehatan Situs</h1>
        </div>
      </div>

      <nav className="adminStatusTabs" aria-label="Menu Peralatan">
        {toolTabs.map((tab) => (
          <Link
            key={tab.slug}
            href={`/admin/tools${tab.slug ? `/${tab.slug}` : ''}`}
            aria-current={tab.slug === 'health' ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <SiteHealthView report={report} />
    </>
  )
}
