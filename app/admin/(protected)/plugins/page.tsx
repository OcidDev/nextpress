import { PluginManager } from '@/components/admin/PluginManager'
import { listInstalledPlugins } from '@/lib/db/queries/plugins'

export default async function PluginsPage() {
  return <PluginManager plugins={await listInstalledPlugins()} />
}
