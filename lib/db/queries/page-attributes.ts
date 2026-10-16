import 'server-only'
import { requireCapability } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { pages } from '@/lib/db/schema'
import { pageParentChoices } from '@/lib/content/page-tree'
import { pageTemplateChoices } from '@/lib/content/page-templates'

export async function getPageAttributeChoices(excludeId?: string) {
  await requireCapability('edit_others_pages')
  const [rows, templates] = await Promise.all([
    getDb()
      .select({
        id: pages.id,
        title: pages.title,
        parentId: pages.parentId,
        menuOrder: pages.menuOrder,
      })
      .from(pages),
    Promise.resolve(pageTemplateChoices),
  ])
  return {
    parents: pageParentChoices(rows, excludeId).map((row) => ({
      id: row.id,
      label: `${'— '.repeat(row.depth)}${row.title}`,
    })),
    templates: templates.map(({ value, label }) => ({ value, label })),
  }
}
export type PageAttributeChoices = Awaited<ReturnType<typeof getPageAttributeChoices>>
