import type { AppearanceSite } from '@/lib/content/appearance'
import {
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
  TwitterIcon,
  LinkedInIcon,
  TiktokIcon,
  WhatsappIcon,
  TelegramIcon,
} from '@/components/ui/icons'
import { getSettings } from '@/lib/db/queries/settings'
import styles from './NavigationMenu.module.css'

const icons = {
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
  TwitterIcon,
  LinkedinIcon: LinkedInIcon,
  TiktokIcon,
  WhatsappIcon,
  TelegramIcon,
}

export async function SocialLinks({ site }: { site?: AppearanceSite }) {
  const { social: socialLinks } = site ?? (await getSettings())
  if (socialLinks.length === 0) return null
  return (
    <ul className={styles.social} aria-label="Media sosial">
      {socialLinks.map((item) => {
        const Icon = icons[item.icon as keyof typeof icons]
        return (
          <li key={item.label}>
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${item.label} (tab baru)`}
              className={styles.socialLink}
            >
              {Icon ? <Icon aria-hidden="true" /> : item.label}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
