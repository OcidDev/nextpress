import type { PluginConfig, PluginManifest } from './manifest'

export const pluginFrameCsp =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts"

const json = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )

export function renderPluginFrame(input: {
  manifest: PluginManifest
  config: PluginConfig
  files: Record<string, string>
  widgetId: string
  preview: boolean
  site: { name: string; description: string }
}) {
  const widget = input.manifest.widgets.find((item) => item.id === input.widgetId)
  if (!widget) throw new Error('Widget tidak ditemukan')
  const context = {
    apiVersion: 1,
    pluginId: input.manifest.id,
    widgetId: widget.id,
    preview: input.preview,
    settings: input.config.settings,
    site: input.site,
  }
  const sdk = `(() => {
    const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const context = ${json(context)};
    const resize = height => { const size = Number(height ?? document.body?.getBoundingClientRect().height); if (Number.isFinite(size)) parent.postMessage({ type: 'nextpress:resize', height: Math.max(60, Math.min(1200, Math.ceil(size))) }, '*'); };
    Object.defineProperty(window, 'BlogCMS', { value: freeze({ ...context, resize }), writable: false, configurable: false });
    addEventListener('DOMContentLoaded', () => { new ResizeObserver(() => requestAnimationFrame(() => resize())).observe(document.body); resize(); });
  })();`
  const css = widget.css ? (input.files[widget.css] ?? '').replace(/<\/style/gi, '<\\/style') : ''
  const script = widget.script
    ? (input.files[widget.script] ?? '').replace(/<\/script/gi, '<\\/script')
    : ''
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(widget.name)}</title><style>html{color-scheme:light dark}body{margin:0;font-family:system-ui,sans-serif;overflow-wrap:anywhere}*{box-sizing:border-box}${css}</style><script>${sdk}</script></head><body>${input.files[widget.html]}<script>${script}</script></body></html>`
}
