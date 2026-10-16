import { userEditor } from '@/lib/db/queries/users'
import { UserForm } from '@/components/admin/UserForm'

export default async function NewUser() {
  const data = (await userEditor())!
  return (
    <>
      <h1>Tambah pengguna</h1>
      <UserForm data={data} />
    </>
  )
}
