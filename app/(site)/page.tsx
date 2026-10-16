import { publicRoute, publicRouteMetadata } from '@/lib/content/public-route'
import { MainContainer } from '@/components/layout/MainContainer'
import type { Metadata } from 'next'
import { pageNumber } from '@/lib/db/queries/posts'
import { SiteFrame } from '@/components/site/SiteFrame'
import { PostList } from '@/components/blog/PostList'
import { PostContent } from '@/components/post/PostContent'
import { getPosts } from '@/lib/db/queries/posts'
import { getPublicPageById } from '@/lib/db/queries/public'
import { getSettings } from '@/lib/db/queries/settings'
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
  const settings = await getSettings()
  if (settings.showOnFront === 'page') {
    const home = await getPublicPageById(settings.pageOnFront)
    return publicPageMetadata({
      title: home?.title || settings.name,
      description: home ? articlePlainText(home.content).slice(0, 160) : settings.description,
      path: '/',
      absoluteTitle: !home,
    })
  }
  return publicPageMetadata({
    title: settings.name,
    description: settings.description,
    path: '/',
    page: pageNumber(query.page),
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
  const settings = await getSettings()
  if (settings.showOnFront === 'page') {
    const home = await getPublicPageById(settings.pageOnFront)
    if (home)
      return (
        <SiteFrame>
          <MainContainer>
            <article className="panel">
              <h1>{home.title}</h1>
              <PostContent html={home.content} />
            </article>
          </MainContainer>
        </SiteFrame>
      )
  }
  const result = await getPosts({ page: pageNumber(query.page) })
  return (
    <SiteFrame>
      <main id="main-content" tabIndex={-1} className="cmsPlainContent">
        <h1>{settings.name}</h1>
        <p className="cmsSiteDescription">{settings.description}</p>
        <PostList result={result} basePath="/" context="home" />
      </main>
    </SiteFrame>
  )
}
