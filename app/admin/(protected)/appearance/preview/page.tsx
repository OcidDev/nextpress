import { requireCapability } from '@/lib/admin'
import { redirect } from 'next/navigation'
export default async function AppearancePreview({
  searchParams,
}: {
  searchParams: Promise<{ revision?: string; path?: string }>
}) {
  await requireCapability('edit_theme_options')
  const params = await searchParams
  redirect(
    `/preview/appearance?${new URLSearchParams({ revision: params.revision || '', path: params.path || '/' })}`,
  )
}
