import { requireCmsUser } from '@/lib/admin'
import { AdminShell } from '@/components/admin/AdminShell'
import { getAdminPreferences, getAdminPendingCount } from '@/lib/db/queries/dashboard'
import { getSettings } from '@/lib/db/queries/settings'
import packageInfo from '@/package.json'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCmsUser()
  const [preferences, pending, settings] = await Promise.all([
    getAdminPreferences(),
    getAdminPendingCount(),
    getSettings(),
  ])
  return (
    <AdminShell
      name={session.user.name}
      role={session.user.role}
      roleLabel={session.user.roleLabel}
      capabilities={session.user.capabilities}
      image={session.user.image}
      siteName={settings.name}
      pendingComments={pending}
      preferences={preferences}
      version={packageInfo.version}
    >
      {children}
    </AdminShell>
  )
}
