import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { SiteSettingsPanel } from '@/components/admin/SiteSettingsPanel'
import { siteSettingsLabels as labels } from '@/components/admin/site-settings-sections'

export default async function SettingsSection({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  await requireAdmin()
  const { section } = await params
  if (!Object.hasOwn(labels, section)) notFound()
  const current = section as keyof typeof labels
  return (
    <>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">PENGATURAN SITUS</p>
          <h1>{labels[current]}</h1>
        </div>
      </div>
      <nav className="adminStatusTabs" aria-label="Bagian pengaturan">
        {Object.entries(labels).map(([slug, label]) => (
          <Link
            key={slug}
            href={`/admin/settings/${slug}`}
            aria-current={current === slug ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <SiteSettingsPanel section={current} />
    </>
  )
}
