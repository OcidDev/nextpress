import { notFound } from 'next/navigation'
import { userEditor } from '@/lib/db/queries/users'
import { UserForm } from '@/components/admin/UserForm'

export default async function EditUser({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const data = await userEditor((await params).id)
  if (!data) notFound()
  return (
    <>
      <h1>Edit pengguna</h1>
      {(await searchParams).saved && <p role="status">Pengguna tersimpan.</p>}
      <UserForm key={data.user!.id} data={data} />
    </>
  )
}
