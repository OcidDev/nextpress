import { getUpdatePageData } from '@/lib/updates/actions-data'
import { UpdateManager } from '@/components/admin/updates/UpdateManager'

export const dynamic = 'force-dynamic'

export default async function UpdatesPage() {
  // The query itself calls requireCapability('update_core'), so a direct visit
  // without the capability redirects before any provider call is made.
  const data = await getUpdatePageData()
  return (
    <>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">DASBOR</p>
          <h1>Pembaruan</h1>
        </div>
      </div>
      <p className="adminPageIntro">
        Pasang rilis stabil resmi pada instalasi Anda. Metode pemasangan mengikuti hosting; konten
        dan pengaturan situs tetap memakai database instalasi ini.
      </p>
      <UpdateManager data={data} />
    </>
  )
}
