import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { categories as categoryTable, pages } from '@/lib/db/schema'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSettings } from '@/lib/db/queries/settings'
import { listCategoryTree, resolveDefaultCategory } from '@/lib/db/queries/taxonomy'
import { requireAdmin } from '@/lib/admin'
import { SettingsSectionForm } from '@/components/admin/SettingsSectionForm'
import { SiteLinksSettingsForm } from '@/components/admin/SiteLinksSettingsForm'
import { MenuSettingsForm } from '@/components/admin/MenuSettingsForm'
const labels = {
  general: 'Umum',
  menus: 'Menu',
  footer: 'Footer',
  social: 'Tautan sosial',
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
  const linkChoices =
    current === 'menus' || current === 'footer'
      ? {
          pages: await getDb()
            .select({ id: pages.id, title: pages.title, slug: pages.slug })
            .from(pages)
            .where(eq(pages.status, 'published'))
            .orderBy(pages.title),
          categories: (
            await getDb()
              .select({
                id: categoryTable.id,
                name: categoryTable.name,
                slug: categoryTable.slug,
              })
              .from(categoryTable)
              .orderBy(categoryTable.name)
          ).map((category) => ({
            ...category,
            permalink: `/${initial.categoryBase || 'category'}/${category.slug}`,
          })),
        }
      : { pages: [], categories: [] }
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
      {current === 'footer' || current === 'social' ? (
        <SiteLinksSettingsForm
          key={current}
          section={current}
          initial={initial}
          choices={linkChoices}
        />
      ) : current === 'menus' ? (
        <MenuSettingsForm initial={initial} choices={linkChoices} />
      ) : (
        <SettingsSectionForm
          section={current}
          initial={initial}
          pages={
            current === 'reading'
              ? await getDb()
                  .select({ id: pages.id, title: pages.title })
                  .from(pages)
                  .where(eq(pages.status, 'published'))
                  .orderBy(pages.title)
              : []
          }
          categories={categories}
          categoryDefault={categoryDefault}
        />
      )}
    </>
  )
}
