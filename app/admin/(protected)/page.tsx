import Link from 'next/link'
import { requireCmsUser } from '@/lib/admin'
import { Dashboard } from '@/components/admin/Dashboard'
import { getAdminPreferences, getDashboardData } from '@/lib/db/queries/dashboard'
import { getSettings } from '@/lib/db/queries/settings'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>
}) {
  const session = await requireCmsUser()
  if (!session.user.capabilities.includes('edit_posts'))
    return (
      <>
        <h1>Dasbor</h1>
        {(await searchParams).denied && (
          <p role="alert">Anda tidak memiliki izin untuk halaman tersebut.</p>
        )}
        <p>Selamat datang, {session.user.name}.</p>
        {session.user.capabilities.includes('edit_profile') && (
          <Link href="/admin/profile">Kelola profil Anda</Link>
        )}
      </>
    )
  const [data, preferences, settings] = await Promise.all([
    getDashboardData(),
    getAdminPreferences(),
    getSettings(),
  ])
  return (
    <>
      {(await searchParams).denied && (
        <p role="alert">Akses admin diperlukan untuk halaman tersebut.</p>
      )}
      <Dashboard
        data={data}
        preferences={preferences}
        siteName={settings.name}
        role={session.user.role}
        canUpload={session.user.capabilities.includes('upload_files')}
      />
    </>
  )
}
