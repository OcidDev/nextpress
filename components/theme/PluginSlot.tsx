import 'server-only'

import { cache } from 'react'
import { getPluginForRender, getPublicPlugins } from '@/lib/db/queries/plugins'
import type { PluginSlot as SlotName } from '@/lib/plugins/manifest'
import { PluginFrame } from './PluginFrame'

const publicPlugins = cache(getPublicPlugins)
const previewPlugin = cache(getPluginForRender)

export async function PluginWidget({
  pluginId,
  widgetId,
  title = '',
  preview = false,
  variant = 'widget',
}: {
  pluginId: string
  widgetId: string
  title?: string
  preview?: boolean
  variant?: 'widget' | 'section'
}) {
  // Only explicit Appearance widgets may preview an inactive installed plugin.
  const plugin = preview
    ? await previewPlugin(pluginId, true)
    : (await publicPlugins()).find((item) => item.id === pluginId)
  const widget = plugin?.manifest.widgets.find((item) => item.id === widgetId)
  if (!plugin || !widget) return null
  return (
    <section
      className={
        variant === 'widget'
          ? 'panel themeWidget themePluginWidget'
          : 'themeSection themePluginSection'
      }
      data-plugin-id={plugin.id}
    >
      {title && <h2>{title}</h2>}
      <PluginFrame
        pluginId={plugin.id}
        widgetId={widget.id}
        title={`${widget.name} — ${plugin.manifest.name}`}
        height={widget.height}
        preview={preview}
        revision={plugin.revision}
      />
    </section>
  )
}

export async function PluginSlot({ slot, preview = false }: { slot: SlotName; preview?: boolean }) {
  const widgets = (await publicPlugins()).flatMap((plugin) =>
    plugin.config.placements
      .filter((placement) => placement.slot === slot)
      .flatMap((placement) => {
        const widget = plugin.manifest.widgets.find((item) => item.id === placement.widgetId)
        return widget
          ? [
              {
                pluginId: plugin.id,
                pluginName: plugin.manifest.name,
                revision: plugin.revision,
                widget,
              },
            ]
          : []
      }),
  )
  if (!widgets.length) return null
  return (
    <div className="themePluginSlot" data-plugin-slot={slot}>
      {widgets.map(({ pluginId, pluginName, revision, widget }) => (
        <PluginFrame
          key={`${pluginId}:${widget.id}`}
          pluginId={pluginId}
          widgetId={widget.id}
          title={`${widget.name} — ${pluginName}`}
          height={widget.height}
          preview={preview}
          revision={revision}
        />
      ))}
    </div>
  )
}
