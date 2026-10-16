import type { ReactNode } from 'react'
import styles from './SectionHeading.module.css'

export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export function SectionHeading({
  children,
  as: Tag = 'h2',
}: {
  children: ReactNode
  as?: HeadingLevel
}) {
  return <Tag className={styles.heading}>{children}</Tag>
}
