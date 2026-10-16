import type { Post, SEO } from '@/types/post'
import type { PluginConfig, PluginManifest } from './manifest'

/** Serializable contract between the host editor and a registered plugin runtime. */
export type ContentSeoProvider = {
  id: string
  name: string
  revision: number
  runtime: NonNullable<PluginManifest['extensions']>['contentSeo'] & string
  config: PluginConfig
}

/** Site identity handed to a runtime when it builds structured data. */
export type ContentSeoSite = {
  url: string
  name: string
  logo?: string
  language: string
}

/**
 * Server half of a content-SEO plugin. A package may declare
 * `extensions.contentSeo`, but none of its features appear until a module
 * implementing this contract is compiled into the build and registered by id.
 * Uploaded ZIP JavaScript never reaches this side; it stays sandboxed in widgets.
 */
export type ContentSeoRuntime = {
  saveSeo(data: FormData, previous: SEO | null | undefined): SEO
  resolveSeo(stored: SEO | null | undefined, config: PluginConfig): SEO
  articleSchema(post: Post, config: PluginConfig, site: ContentSeoSite): unknown
}

/** Props the host editor passes to a runtime's editor panel. */
export type ContentSeoPanelProps = {
  provider: ContentSeoProvider
  initial?: SEO | null
  title: string
  description?: string
  canUpload?: boolean
  onChange: () => void
}
