import { userHasCapability } from '@/lib/core/roles'
import { requireCapability } from '@/lib/admin'
import { PageEditor } from '@/components/admin/PageEditor'
import { getPageAttributeChoices } from '@/lib/db/queries/page-attributes'
export default async function NewPage() {
  const session = await requireCapability('edit_others_pages')
  return (
    <>
      <h1>Buat halaman</h1>
      <PageEditor
        canUpload={userHasCapability(session.user, 'upload_files')}
        attributes={await getPageAttributeChoices()}
      />
    </>
  )
}
