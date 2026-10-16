import type { AppearanceSite } from '@/lib/content/appearance'
import { NavigationMenu } from '@/components/navigation/NavigationMenu'
import { NavigationRail } from '@/components/navigation/NavigationRail'

export function DesktopNavigation({ site }: { site?: AppearanceSite }) {
  return (
    <NavigationRail>
      <NavigationMenu site={site} desktop />
    </NavigationRail>
  )
}
