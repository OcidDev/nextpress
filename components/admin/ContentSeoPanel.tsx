'use client'

import type { ComponentType } from 'react'
import type { ContentSeoPanelProps, ContentSeoProvider } from '@/lib/plugins/content-seo'

// No runtime ships with the CMS, so no panel renders and a package that declares
// `extensions.contentSeo` installs without adding anything to the editor. A
// runtime only reaches this map once its module is compiled into the build and
// registered in lib/plugins/content-seo-server.ts.
const panels: Record<string, ComponentType<ContentSeoPanelProps>> = {}

export function ContentSeoPanel({
  provider,
  ...props
}: Omit<ContentSeoPanelProps, 'provider'> & {
  provider: ContentSeoProvider | null
}) {
  if (!provider) return null
  const Panel = panels[provider.runtime]
  return Panel ? <Panel provider={provider} {...props} /> : null
}
