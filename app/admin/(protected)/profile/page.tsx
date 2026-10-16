import { requireCmsUser } from '@/lib/admin'
import { getPersonalProfile } from '@/lib/db/queries/profile'
import {
  ProfileIdentityForm,
  ProfileEmailForm,
  ProfilePasswordForm,
} from '@/components/admin/ProfileForms'

export default async function ProfilePage() {
  await requireCmsUser()
  const data = await getPersonalProfile()

  return (
    <>
      <div className="adminPageHeader">
        <h1>Profil Saya</h1>
      </div>
      <div className="profileFormsGrid">
        <ProfileIdentityForm data={data} />
        <ProfileEmailForm currentEmail={data.user.email} />
        <ProfilePasswordForm />
      </div>
    </>
  )
}
