import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { legacyAuthorEditor } from '@/lib/db/queries/users'
import { LegacyAuthorForm } from '@/components/admin/LegacyAuthorForm'

export default async function EditLegacyAuthorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const data = await legacyAuthorEditor(id)
  if (!data) notFound()

  return (
    <>
      <div className="adminPageHeading">
        <h1>Edit profil lama</h1>
        <Link href="/admin/users">Kembali ke Pengguna</Link>
      </div>
      <LegacyAuthorForm data={data} />
    </>
  )
}
