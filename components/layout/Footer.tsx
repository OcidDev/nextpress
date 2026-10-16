import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { Appearance } from '@/lib/content/appearance'
import { defaultAppearance } from '@/lib/content/appearance'
import { Widgets } from '@/components/theme/Widgets'
import { SocialLinks } from '@/components/navigation/SocialLinks'
import { BackToTop } from '@/components/ui/BackToTop'
import { getSettings } from '@/lib/db/queries/settings'
import styles from './Footer.module.css'

export async function Footer({
  appearance,
  preview = false,
  siteViews,
}: {
  appearance?: Appearance
  preview?: boolean
  siteViews?: number | null
}) {
  const site = appearance?.site ?? (await getSettings())
  const options = appearance?.footer ?? defaultAppearance().footer
  const name = options.name || site.name
  const description = options.description || site.description
  const logo = options.logo || site.logo
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Jakarta' }).format(
    new Date(),
  )
  return (
    <footer className={styles.footer}>
      {options.showWaves && (
        <div className={styles.waves} aria-hidden="true">
          <svg viewBox="0 24 150 28" preserveAspectRatio="none">
            {[0, 3, 5, 7].map((offset, index) => (
              <g key={offset} transform={`translate(0 ${offset})`}>
                <path
                  className={styles.wave}
                  style={{
                    opacity: [0.3, 0.4, 0.5, 0.8][index],
                    animationDuration: `${[12, 18, 24, 30][index]}s`,
                    animationDelay: `${[-2, -6, -10, -14][index]}s`,
                  }}
                  d="M-176 44c44 0 44-18 88-18s44 18 88 18 44-18 88-18 44 18 88 18 44-18 88-18 44 18 88 18 44-18 88-18 44 18 88 18v44h-704z"
                />
              </g>
            ))}
          </svg>
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.inner}>
          <div className={styles.columns}>
            <div className={styles.brand}>
              {options.intro && <p className={styles.intro}>{options.intro}</p>}
              <div className={styles.brandRow}>
                <Link href="/" aria-label={`${name} — Beranda`} className={styles.logo}>
                  {logo ? (
                    <Image unoptimized src={logo} width={70} height={70} alt="" />
                  ) : (
                    <span aria-hidden="true">{name[0]?.toLowerCase()}.</span>
                  )}
                </Link>
                <div className={styles.brandText}>
                  <h2>
                    <Link href="/">{name}</Link>
                  </h2>
                  {description && <p className={styles.description}>{description}</p>}
                </div>
              </div>
              {options.showStats && siteViews !== null && siteViews !== undefined && (
                <p
                  className={styles.stats}
                  title="Tayangan halaman publik; kunjungan berulang dibatasi per halaman dalam 30 menit."
                >
                  Situs ini telah dibaca{' '}
                  <strong>
                    {new Intl.NumberFormat('id', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(siteViews)}
                  </strong>{' '}
                  kali.
                </p>
              )}
              {options.showSocial &&
                site.social.length > 0 &&
                (options.socialStyle === 'icons' ? (
                  <div className={styles.socialIcons}>
                    <SocialLinks site={site} />
                  </div>
                ) : (
                  <ul className={styles.social} aria-label="Media sosial">
                    {site.social.map((item, index) => (
                      <li key={`${index}-${item.label}`}>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${item.label} (tab baru)`}
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
            {site.footer.map(
              (column, index) =>
                column.enabled && (
                  <nav
                    key={index}
                    aria-label={column.title}
                    className={styles.linkColumn}
                    style={{ '--footer-slot': index + 2 } as CSSProperties}
                  >
                    <h2>{column.title}</h2>
                    <ul>
                      {column.links.map((link, position) => (
                        <li key={`${position}-${link.href}`}>
                          <Link href={link.href}>{link.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ),
            )}
          </div>
          {appearance && appearance.footerWidgets.some((widget) => widget.enabled) && (
            <div className={styles.extraWidgets}>
              <Widgets
                footer
                items={appearance.footerWidgets}
                site={appearance.site}
                preview={preview}
              />
            </div>
          )}
          <div className={styles.credit}>
            {options.copyrightText ? (
              <small>
                {options.copyrightText.replaceAll('{year}', year).replaceAll('{site}', site.name)}
              </small>
            ) : (
              <small>
                © {year}
                <span aria-hidden="true"> · </span>
                <Link href="/">{site.name}</Link>
                <span aria-hidden="true"> · </span>Semua hak dilindungi.
              </small>
            )}
          </div>
        </div>
      </div>
      {options.showBackToTop && <BackToTop />}
    </footer>
  )
}
