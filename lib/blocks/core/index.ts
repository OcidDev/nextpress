import {
  siteHeaderBlock,
  siteFooterBlock,
  routeContentBlock,
  homeSectionsBlock,
  contentLayoutBlock,
  siteDescriptionBlock,
  mobileNavigationBlock,
} from './chrome'
import type { BlockDefinition } from '../render'
import { columnsBlock, groupBlock, headingBlock, paragraphBlock, spacerBlock } from './layout'
import { paginationBlock, postListBlock } from './lists'
import {
  commentsBlock,
  postAuthorBlock,
  postContentBlock,
  postFeaturedImageBlock,
  postMetaBlock,
  postShareBlock,
  postTitleBlock,
  postTocBlock,
  relatedPostsBlock,
} from './post'
import {
  navigationBlock,
  pluginWidgetBlock,
  searchBlock,
  siteLogoBlock,
  siteTitleBlock,
  templatePartBlock,
  themeToggleBlock,
  widgetAreaBlock,
} from './site'

/**
 * Seluruh blok bawaan build ini.
 *
 * Daftarnya harus sama persis dengan `coreBlockNames` di `lib/blocks/schemas.ts` —
 * nama yang punya skema props tetapi tidak punya definisi akan lolos validasi
 * template lalu dirender kosong, dan itu bug yang sulit dilihat. Perbarui kedua
 * daftar bersama saat menambah atau menghapus blok.
 */
export const coreBlocks: readonly BlockDefinition[] = [
  mobileNavigationBlock,
  siteHeaderBlock,
  siteFooterBlock,
  routeContentBlock,
  homeSectionsBlock,
  contentLayoutBlock,
  siteDescriptionBlock,
  // Tata letak dan teks
  groupBlock,
  columnsBlock,
  spacerBlock,
  headingBlock,
  paragraphBlock,
  // Identitas dan navigasi situs
  templatePartBlock,
  siteLogoBlock,
  siteTitleBlock,
  navigationBlock,
  searchBlock,
  themeToggleBlock,
  widgetAreaBlock,
  pluginWidgetBlock,
  // Artikel
  postTitleBlock,
  postMetaBlock,
  postFeaturedImageBlock,
  postContentBlock,
  postTocBlock,
  postShareBlock,
  postAuthorBlock,
  relatedPostsBlock,
  commentsBlock,
  // Daftar artikel
  postListBlock,
  paginationBlock,
]
