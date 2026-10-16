'use client'

import Link from 'next/link'
import {
  FolderIcon,
  HomeIcon,
  MessageIcon,
  ProfilesIcon,
  ShieldDoneIcon,
  ArowDownIcon,
} from '@/components/ui/icons'
import type { NavItem } from '@/types'
import styles from './NavigationMenu.module.css'

const icons = { FolderIcon, HomeIcon, MessageIcon, ProfilesIcon, ShieldDoneIcon }

export function NavigationItem({ item }: { item: NavItem }) {
  const Icon = icons[item.icon as keyof typeof icons] ?? FolderIcon
  return (
    <li className={item.divider ? styles.divider : undefined}>
      {item.children ? (
        <details className={styles.dropdown}>
          <summary
            aria-label={item.label}
            title={item.label}
            onClick={(event) => {
              if (
                window.matchMedia('(min-width: 897px)').matches &&
                event.currentTarget.closest('[data-collapsed="true"]')
              ) {
                window.dispatchEvent(new CustomEvent('nextpress:toggle-navigation'))
              }
            }}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
            <ArowDownIcon className={styles.chevron} aria-hidden="true" />
          </summary>
          <ul>
            {item.children.map((child) => (
              <li key={child.href}>
                <Link href={child.href}>{child.label}</Link>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <Link href={item.href ?? '/'} aria-label={item.label} title={item.label}>
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      )}
    </li>
  )
}
