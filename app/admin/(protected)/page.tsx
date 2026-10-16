import Link from 'next/link'
import { requireCmsUser } from '@/lib/admin'
import { Dashboard } from '@/components/admin/Dashboard'
import { ExtensionsNotice } from '@/components/admin/ExtensionsNotice'
import { getAdminPreferences, getDashboardData } from '@/lib/db/queries/dashboard'
import { getSettings } from '@/lib/db/queries/settings'
import { knownExtensionIds } from '@/lib/extensions/bootstrap'
import { listPausedExtensions } from '@/lib/extensions/health-query'

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
  // Mode pemulihan hanya relevan bagi yang dapat menindaklanjutinya
  // (kapabilitas `activate_plugins`), jadi penulis tidak membayar query-nya.
  const known = new Set(knownExtensionIds())
  const paused = session.user.capabilities.includes('activate_plugins')
    ? (await listPausedExtensions()).map((entry) => ({ ...entry, present: known.has(entry.id) }))
    : []
  return (
    <>
      {(await searchParams).denied && (
        <p role="alert">Akses admin diperlukan untuk halaman tersebut.</p>
      )}
      <ExtensionsNotice paused={paused} />
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
