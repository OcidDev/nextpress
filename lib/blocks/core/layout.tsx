import { createElement, type ReactNode } from 'react'
import { SectionHeading, type HeadingLevel } from '@/components/theme/SectionHeading'
import { defineBlock } from '../render'
import { blockPropsSchemas } from '../schemas'
import styles from './blocks.module.css'

/**
 * Blok tata letak dan teks: pembungkus, kolom, jarak, judul, paragraf.
 *
 * Ini satu-satunya berkas blok yang menulis markup sendiri, bukan membungkus
 * komponen yang sudah ada — karena di tema belum ada komponen padanannya. Gaya
 * yang dipakai sengaja meminjam kelas tema yang sudah ada (`themeSection`) alih-alih
 * membuat kelas baru yang hanya berbeda nama.
 */

/** Elemen pembungkus; `children` dirender di dalamnya. */
export const groupBlock = defineBlock({
  name: 'core/group',
  props: blockPropsSchemas['core/group'],
  container: true,
  render(props, { children }) {
    const className =
      [props.layout === 'constrained' ? 'themeSection' : '', props.className]
        .filter(Boolean)
        .join(' ') || undefined
    return createElement(props.tagName ?? 'div', { className }, children)
  },
})

/**
 * Kolom. Setiap anak langsung menjadi satu sel kisi, jadi jumlah anak yang
 * melebihi `columns` akan membungkus ke baris berikutnya — bukan galat.
 */
export const columnsBlock = defineBlock({
  name: 'core/columns',
  props: blockPropsSchemas['core/columns'],
  container: true,
  render(props, { children }): ReactNode {
    return (
      <div className={styles.columns} data-columns={props.columns ?? 2}>
        {children}
      </div>
    )
  },
})

export const spacerBlock = defineBlock({
  name: 'core/spacer',
  props: blockPropsSchemas['core/spacer'],
  render: (props) => (
    <div className={styles.spacer} data-size={props.size ?? 'md'} aria-hidden="true" />
  ),
})

export const headingBlock = defineBlock({
  name: 'core/heading',
  props: blockPropsSchemas['core/heading'],
  render: (props) => (
    <SectionHeading as={`h${props.level ?? 2}` as HeadingLevel}>{props.text}</SectionHeading>
  ),
})

export const paragraphBlock = defineBlock({
  name: 'core/paragraph',
  props: blockPropsSchemas['core/paragraph'],
  render: (props) => <p className={styles.paragraph}>{props.text}</p>,
})
