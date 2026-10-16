import type { ReactNode } from 'react'
import { Logo } from '@/components/header/Logo'
import { SearchButton } from '@/components/header/SearchButton'
import { ThemeToggle } from '@/components/header/ThemeToggle'
import { NavigationMenu } from '@/components/navigation/NavigationMenu'
import { PluginSlot, PluginWidget } from '@/components/theme/PluginSlot'
import { defineBlock } from '../render'
import { blockPropsSchemas } from '../schemas'
import styles from './blocks.module.css'

/**
 * Blok identitas dan navigasi situs.
 *
 * Semuanya membungkus komponen yang sudah dipakai halaman biasa — logo header,
 * menu, tombol cari, sakelar tema, dan slot plugin. Tidak ada satu pun yang
 * mengambil datanya sendiri lewat query baru: identitas situs datang dari
 * `context.site`, dan slot plugin memakai komponen yang sudah punya cache-nya
 * sendiri (`getPublicPlugins` di `components/theme/PluginSlot.tsx`).
 */

/**
 * Menyisipkan template part lain. Isinya datang dari `options.parts` yang
 * diserahkan pemanggil (di aplikasi: resolver paket tema, EXT-05); rujukan yang
 * tidak ada atau melingkar dirender kosong dan dicatat oleh renderer.
 */
export const templatePartBlock = defineBlock({
  name: 'core/template-part',
  props: blockPropsSchemas['core/template-part'],
  render: (props, { renderPart }) => renderPart(props.slug),
})

export const siteLogoBlock = defineBlock({
  name: 'core/site-logo',
  props: blockPropsSchemas['core/site-logo'],
  render: (_props, { context }) => <Logo site={context.site} />,
})

export const siteTitleBlock = defineBlock({
  name: 'core/site-title',
  props: blockPropsSchemas['core/site-title'],
  render(props, { context }): ReactNode {
    const Tag = `h${props.level ?? 1}` as 'h1'
    return <Tag className={styles.siteTitle}>{context.site.name}</Tag>
  },
})

export const navigationBlock = defineBlock({
  name: 'core/navigation',
  props: blockPropsSchemas['core/navigation'],
  render: (props, { context }) => (
    <NavigationMenu label={props.label} site={context.site} desktop />
  ),
})

export const searchBlock = defineBlock({
  name: 'core/search',
  props: blockPropsSchemas['core/search'],
  render: (props) => <SearchButton label={props.label} />,
})

export const themeToggleBlock = defineBlock({
  name: 'core/theme-toggle',
  props: blockPropsSchemas['core/theme-toggle'],
  render: () => <ThemeToggle />,
})

/** Area widget plugin pada satu slot; sama dengan `PluginSlot` di halaman biasa. */
export const widgetAreaBlock = defineBlock({
  name: 'core/widget-area',
  props: blockPropsSchemas['core/widget-area'],
  render: (props, { context }) => <PluginSlot slot={props.slot} preview={context.preview} />,
})

/** Widget dari satu plugin terpasang, ditunjuk langsung oleh id. */
export const pluginWidgetBlock = defineBlock({
  name: 'core/plugin-widget',
  props: blockPropsSchemas['core/plugin-widget'],
  render: (props, { context }) => (
    <PluginWidget pluginId={props.pluginId} widgetId={props.widgetId} preview={context.preview} />
  ),
})
