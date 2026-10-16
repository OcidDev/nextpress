import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/admin'
import { getActiveThemeId } from '@/lib/themes/manager'
export default async function CustomizePage() {
  await requireCapability('edit_theme_options')
  redirect(`/admin/site-editor?theme=${await getActiveThemeId()}`)
}
