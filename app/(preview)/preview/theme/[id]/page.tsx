import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/admin'
import { getThemePackage } from '@/lib/themes/manager'
import { ThemePage } from '@/lib/themes/ThemePage'
import { themePreviewContext } from '@/lib/themes/preview-context'
import { ThemeLivePreview } from '@/components/admin/themes/ThemeLivePreview'
import { PreviewNavigation } from '@/components/theme/PreviewNavigation'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Pratinjau tema',
  robots: { index: false, follow: false },
}
export default async function ThemePreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ draft?: string; path?: string; revision?: string }>
}) {
  await requireCapability('edit_theme_options')
  const theme = await getThemePackage((await params).id)
  if (!theme) notFound()
  const input = await searchParams
  const preview = await themePreviewContext(input.path)
  return (
    <>
      <PreviewNavigation
        themeId={theme.manifest.id}
        draft={input.draft === '1'}
        revision={Number(input.revision) || 0}
      />
      {theme.customization && (
        <ThemeLivePreview themeId={theme.manifest.id} config={theme.customization} />
      )}
      <ThemePage
        previewTheme={theme}
        previewDraft={input.draft === '1'}
        query={preview.query}
        context={preview.context}
      >
        {preview.content}
      </ThemePage>
    </>
  )
}
