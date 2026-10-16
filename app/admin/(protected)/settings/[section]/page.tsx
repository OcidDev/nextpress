import { getDb } from '@/lib/db'
import { pages } from '@/lib/db/schema'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSettings } from '@/lib/db/queries/settings'
import { listCategoryTree, resolveDefaultCategory } from '@/lib/db/queries/taxonomy'
import { requireAdmin } from '@/lib/admin'
import { SettingsSectionForm } from '@/components/admin/SettingsSectionForm'
const labels = {
  general: 'Umum',
  writing: 'Menulis',
  reading: 'Membaca',
  permalinks: 'Permalink',
  discussion: 'Diskusi',
  integrations: 'Integrasi',
}
export default async function SettingsSection({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  await requireAdmin()
  const { section } = await params
  if (!Object.hasOwn(labels, section)) notFound()
  const current = section as keyof typeof labels
  const initial = await getSettings()
  const categories = current === 'writing' ? await listCategoryTree() : []
  const categoryDefault =
    current === 'writing' ? await resolveDefaultCategory(initial.defaultCategory) : undefined
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
      <SettingsSectionForm
        section={current}
        initial={initial}
        pages={
          current === 'reading'
            ? await getDb()
                .select({ id: pages.id, title: pages.title })
                .from(pages)
                .orderBy(pages.title)
            : []
        }
        categories={categories}
        categoryDefault={categoryDefault}
      />
    </>
  )
}
