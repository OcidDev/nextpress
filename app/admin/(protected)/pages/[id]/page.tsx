import { requireCapability } from '@/lib/admin'
import { userHasCapability } from '@/lib/core/roles'
import { notFound } from 'next/navigation'
import { adminPage } from '@/lib/db/queries/admin-content'
import { PageEditor } from '@/components/admin/PageEditor'
import { getPageAttributeChoices } from '@/lib/db/queries/page-attributes'
export default async function EditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const session = await requireCapability('edit_others_pages')
  const page = await adminPage((await params).id)
  if (!page) notFound()
  return (
    <>
      <h1>Edit halaman</h1>
      <PageEditor
        canUpload={userHasCapability(session.user, 'upload_files')}
        key={page.id}
        page={page}
        saved={(await searchParams).saved === '1'}
        attributes={await getPageAttributeChoices(page.id)}
      />
    </>
  )
}
