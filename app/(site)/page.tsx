import { publicRoute, publicRouteMetadata } from '@/lib/content/public-route'
import { MainContainer } from '@/components/layout/MainContainer'
import type { Metadata } from 'next'
import { getAppearance } from '@/lib/db/queries/appearance'
import { pageNumber } from '@/lib/db/queries/posts'
import { HomeSections } from '@/components/theme/HomeContent'
import { ThemePage } from '@/lib/themes/ThemePage'
import { getPosts } from '@/lib/db/queries/posts'
import { getPublicPageById } from '@/lib/db/queries/theme'
import { publicPageMetadata } from '@/lib/content/metadata'
import { articlePlainText } from '@/lib/content/article'
export const dynamic = 'force-dynamic'
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; p?: string }>
}): Promise<Metadata> {
  const query = await searchParams
  if (query.p !== undefined) return publicRouteMetadata(`/?p=${encodeURIComponent(query.p)}`)
  const appearance = await getAppearance()
  if (appearance.home.mode === 'page') {
    const home = await getPublicPageById(appearance.home.pageId)
    return publicPageMetadata({
      title: home?.title || appearance.site.name,
      description: home ? articlePlainText(home.content).slice(0, 160) : undefined,
      path: '/',
      absoluteTitle: !home,
      seo: home?.seo,
    })
  }
  const page = appearance.home.sections.some(
    (section) => section.type === 'latest' && section.enabled,
  )
    ? pageNumber((await searchParams).page)
    : 1
  return publicPageMetadata({
    title: appearance.site.name,
    description: appearance.site.description,
    path: '/',
    page,
    absoluteTitle: true,
  })
}
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; p?: string }>
}) {
  const query = await searchParams
  if (query.p !== undefined) return publicRoute(`/?p=${encodeURIComponent(query.p)}`)
  const appearance = await getAppearance()
  const page = pageNumber((await searchParams).page)
  const result = await getPosts({ page })
  const staticPage =
    appearance.home.mode === 'page' ? await getPublicPageById(appearance.home.pageId) : null
  return (
    <ThemePage
      query={{
        kind: 'front_page',
        showOnFront: appearance.home.mode === 'page' ? 'page' : 'posts',
        slug: staticPage?.slug,
        id: staticPage?.id,
      }}
      context={{
        page: staticPage ?? undefined,
        archive: { result, basePath: '/', context: 'home' },
      }}
    >
      <MainContainer site={appearance.site}>
        <HomeSections appearance={appearance} page={page} />
      </MainContainer>
    </ThemePage>
  )
}
