'use client'

import { useEffect, useRef, useState } from 'react'

export function PluginFrame({
  pluginId,
  widgetId,
  title,
  height,
  revision = 0,
  preview = false,
}: {
  pluginId: string
  widgetId: string
  title: string
  height: number
  revision?: number
  preview?: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const initialHeight = Math.max(60, Math.min(1200, Math.round(height)))
  const [frameHeight, setFrameHeight] = useState(initialHeight)
  useEffect(
    () => setFrameHeight(initialHeight),
    [initialHeight, pluginId, widgetId, preview, revision],
  )
  useEffect(() => {
    function resize(event: MessageEvent) {
      const target = frame.current?.contentWindow
      if (!target || event.source !== target) return
      const data: unknown = event.data
      if (
        !data ||
        typeof data !== 'object' ||
        !('type' in data) ||
        data.type !== 'nextpress:resize' ||
        !('height' in data)
      )
        return
      if (
        typeof data.height !== 'number' ||
        !Number.isFinite(data.height) ||
        data.height < 60 ||
        data.height > 1200
      )
        return
      setFrameHeight(Math.ceil(data.height))
    }
    window.addEventListener('message', resize)
    return () => window.removeEventListener('message', resize)
  }, [])
  const query = new URLSearchParams(
    preview ? { preview: '1', revision: String(revision) } : { revision: String(revision) },
  )
  return (
    <iframe
      ref={frame}
      className="themePluginFrame"
      title={title}
      src={`/api/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(widgetId)}?${query}`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      loading="lazy"
      height={frameHeight}
      style={{ width: '100%', height: frameHeight, border: 0, display: 'block' }}
    />
  )
}
