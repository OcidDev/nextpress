import { getSettings } from '@/lib/db/queries/settings'
import { getPosts, pageNumber } from '@/lib/db/queries/posts'
import { PostList } from '@/components/blog/PostList'
import { headers } from 'next/headers'
import { enforceCanonical } from '@/lib/content/canonical'
import { ThemePage } from '@/lib/themes/ThemePage'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPage } from '@/lib/db/queries/posts'
import { MainContainer } from '@/components/layout/MainContainer'
import { PostContent } from '@/components/post/PostContent'
import { publicPageMetadata } from '@/lib/content/metadata'
import { articlePlainText } from '@/lib/content/article'
import { applyFilters } from '@/lib/extensions/hooks'
import { bootExtensions } from '@/lib/extensions/bootstrap'
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
        seo: p.seo,
      })
    : { title: 'Halaman tidak ditemukan', robots: { index: false } }
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
      <ThemePage
        query={{ kind: 'home' }}
        context={{ page, archive: { result, basePath: `/${page.slug}`, postsPage: true } }}
      >
        <MainContainer>
          <h1>{page.title}</h1>
          <PostList result={result} basePath={`/${page.slug}`} />
        </MainContainer>
      </ThemePage>
    )
  }
  await bootExtensions()
  // `the_title` (EXT-01): judul yang tampil dapat diubah ekstensi; metadata
  // dokumen tetap lewat `document_title` di `generateMetadata`.
  const title = await applyFilters('the_title', page.title)
  return (
    <ThemePage
      query={{ kind: 'page', slug: page.slug, id: page.id }}
      context={{ page: { ...page, title } }}
    >
      <MainContainer>
        <article className="panel">
          <h1>{title}</h1>
          <PostContent html={page.content} />
        </article>
      </MainContainer>
    </ThemePage>
  )
}
