import { getSettings } from '@/lib/db/queries/settings'
import { getPosts, pageNumber } from '@/lib/db/queries/posts'
import { PostList } from '@/components/blog/PostList'
import { headers } from 'next/headers'
import { enforceCanonical } from '@/lib/content/canonical'
import { SiteFrame } from '@/components/site/SiteFrame'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPage } from '@/lib/db/queries/posts'
import { MainContainer } from '@/components/layout/MainContainer'
import { PostContent } from '@/components/post/PostContent'
import { publicPageMetadata } from '@/lib/content/metadata'
import { articlePlainText } from '@/lib/content/article'
import { SearchButton } from '@/components/header/SearchButton'
import { isPageTemplate } from '@/lib/content/page-templates'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const p = await getPage((await params).slug)
  const settings = await getSettings()
  const front = settings.showOnFront === 'page' && settings.pageOnFront === p?.id
  const postsPage = settings.showOnFront === 'page' && settings.pageForPosts === p?.id
  const search = new URL((await headers()).get('x-cms-request-path') || '/', 'http://cms.local')
    .searchParams
  return p
    ? publicPageMetadata({
        title: p.title,
        description: articlePlainText(p.content).slice(0, 160),
        path: front ? '/' : `/${p.slug}`,
        page: postsPage ? pageNumber(search.get('page')) : 1,
      })
    : { title: 'Halaman tidak ditemukan', robots: { index: false } }
}

/**
 * Varian template laman. Ketiganya memakai tata letak polos, bukan
 * `MainContainer`, sama seperti template tema sebelumnya.
 */
async function renderTemplate(pageTemplate: string, page: { title: string; content: string }) {
  const title = <h1>{page.title}</h1>
  return (
    <main id="main-content" tabIndex={-1} className="cmsPlainContent">
      {pageTemplate === 'page-with-sidebar' ? (
        <div className="cmsPageSidebarLayout">
          <article className="cmsPageArticle">
            {title}
            <PostContent html={page.content} />
          </article>
          <aside className="cmsPageSidebar">
            <h2>Tentang situs</h2>
            <p className="cmsSiteDescription">{(await getSettings()).description}</p>
            <SearchButton label="Cari di situs" />
          </aside>
        </div>
      ) : (
        <article className="cmsPageArticle">
          {pageTemplate === 'page-no-title' ? null : title}
          <PostContent html={page.content} />
        </article>
      )}
    </main>
  )
}

export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = await getPage((await params).slug)
  if (!page) notFound()
  const settings = await getSettings()
  await enforceCanonical(
    settings.showOnFront === 'page' && settings.pageOnFront === page.id ? '/' : `/${page.slug}`,
  )
  if (settings.showOnFront === 'page' && settings.pageForPosts === page.id) {
    const search = new URL((await headers()).get('x-cms-request-path') || '/', 'http://cms.local')
      .searchParams
    const result = await getPosts({ page: pageNumber(search.get('page')) })
    return (
      <SiteFrame>
        <MainContainer>
          <h1>{page.title}</h1>
          <PostList result={result} basePath={`/${page.slug}`} />
        </MainContainer>
      </SiteFrame>
    )
  }
  if (isPageTemplate(page.pageTemplate))
    return (
      <SiteFrame pageTemplate={page.pageTemplate}>
        {await renderTemplate(page.pageTemplate, page)}
      </SiteFrame>
    )
  return (
    <SiteFrame pageTemplate={page.pageTemplate}>
      <MainContainer>
        <article className="panel">
          <h1>{page.title}</h1>
          <PostContent html={page.content} />
        </article>
      </MainContainer>
    </SiteFrame>
  )
}
