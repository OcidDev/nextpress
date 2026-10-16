import 'server-only'
import { cache } from 'react'
import { getActiveTheme } from './manager'
import { getPublicPlugins } from '@/lib/db/queries/plugins'
import type { ThemePackage } from './package'
import type { ThemeTemplate } from './template'
import type { PageTemplateChoice } from './page-template-schema'

export type ResolvedPageTemplate = PageTemplateChoice & { template: ThemeTemplate; name: string }
export const getPageTemplates = cache(
  async (selectedTheme?: ThemePackage): Promise<ResolvedPageTemplate[]> => {
    const [theme, plugins] = await Promise.all([
      selectedTheme ?? getActiveTheme(),
      getPublicPlugins(),
    ])
    return [
      ...theme.pageTemplates.map((item) => ({
        value: `theme:${theme.manifest.id}:${item.name}`,
        label: item.title,
        source: theme.manifest.name,
        name: item.name,
        template: theme.templates[item.name]!,
      })),
      ...plugins.flatMap((plugin) =>
        (plugin.manifest.pageTemplates ?? []).map((item) => ({
          value: `plugin:${plugin.id}:${item.id}`,
          label: item.name,
          source: plugin.manifest.name,
          name: `plugin:${plugin.id}:${item.id}`,
          template: item.template,
        })),
      ),
    ]
  },
)
