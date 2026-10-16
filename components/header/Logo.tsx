import Link from 'next/link'
import type { AppearanceSite } from '@/lib/content/appearance'
import { getSettings } from '@/lib/db/queries/settings'
import Image from 'next/image'
import styles from './Logo.module.css'

export async function Logo({ site }: { site?: AppearanceSite }) {
  const siteConfig = site ?? (await getSettings())
  return (
    <Link href="/" className={styles.logo} aria-label={`${siteConfig.name} — Beranda`}>
      <span aria-hidden="true">
        {siteConfig.logo ? (
          <Image unoptimized src={siteConfig.logo} width={34} height={34} alt="" />
        ) : (
          <span className={styles.mark}>
            {siteConfig.name[0]?.toLowerCase()}
            <span>.</span>
          </span>
        )}
      </span>
      <span>{siteConfig.name}</span>
    </Link>
  )
}
