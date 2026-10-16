import { findPublicPostRoute, findPublicTaxonomyRoute } from '@/lib/content/permalink-server'
import type { Metadata } from 'next'
import { requireCapability } from '@/lib/admin'
import { getAppearanceEditor } from '@/lib/db/queries/appearance'
import { getSettings } from '@/lib/db/queries/settings'
import {
  getPostBySlug,
  getPage,
  getPosts,
  getCategory,
  getAuthor,
  pageNumber,
} from '@/lib/db/queries/posts'
import { SiteFrame } from '@/components/theme/SiteFrame'
import { HomeContent } from '@/components/theme/HomeContent'
import { MainContainer } from '@/components/layout/MainContainer'
import { PostList } from '@/components/blog/PostList'
import { PostContent } from '@/components/post/PostContent'
import { PreviewNavigation } from '@/components/theme/PreviewNavigation'
import { ArticleContent } from '@/components/post/ArticleContent'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Preview tampilan',
  robots: { index: false, follow: false },
}
export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ revision?: string; path?: string }>
}) {
  await requireCapability('edit_theme_options')
  const [{ draft }, settings, params] = await Promise.all([
    getAppearanceEditor(),
    getSettings(),
    searchParams,
  ])
  if (params.revision && Number(params.revision) !== draft.revision)
    return (
      <main className="panel">
        <h1>Rancangan telah diperbarui</h1>
        <p>Simpan atau muat ulang editor untuk melihat versi terbaru.</p>
      </main>
    )
  const config = draft.config
  const rawPath = params.path || '/'
  const safePath =
    /^\/(?!\/|\\)/.test(rawPath) && !/[\\\u0000-\u001f]/.test(rawPath) ? rawPath : '/'
  const url = new URL(safePath, 'http://preview.local'),
    path = url.pathname,
    page = pageNumber(url.searchParams.get('page'))
  const articleRoute = await findPublicPostRoute(
    path + (url.searchParams.has('p') ? `?p=${url.searchParams.get('p')}` : ''),
  )
  const term = await findPublicTaxonomyRoute(path)
  let content: React.ReactNode
  if (path === '/' && !articleRoute && !url.searchParams.has('p'))
    content = <HomeContent appearance={config} page={page} preview />
  else if (articleRoute) {
    const post = await getPostBySlug(articleRoute.slug)
    content = post ? (
      <ArticleContent post={post} appearance={config} preview />
    ) : (
      <MainContainer site={config.site}>
        <h1>Artikel tidak ditemukan</h1>
      </MainContainer>
    )
  } else if (term?.kind === 'tag') {
    const slug = term.slug
    content = (
      <MainContainer site={config.site}>
        <h1>Tag: {slug}</h1>
        <PostList
          result={await getPosts({ tag: slug, page })}
          basePath={path}
          appearance={config}
          preview
        />
      </MainContainer>
    )
  } else if (term?.kind === 'category') {
    const slug = term.slug,
      category = await getCategory(slug)
    content = (
      <MainContainer site={config.site}>
        <h1>{category?.name || 'Kategori'}</h1>
        <PostList
          result={await getPosts({ categorySlug: slug, page })}
          basePath={path}
          appearance={config}
          preview
        />
      </MainContainer>
    )
  } else if (path.startsWith('/author/')) {
    const slug = path.slice(8),
      author = await getAuthor(slug)
    content = (
      <MainContainer site={config.site}>
        <h1>{author?.name || 'Penulis'}</h1>
        <PostList
          result={await getPosts({ authorSlug: slug, page })}
          basePath={path}
          appearance={config}
          preview
        />
      </MainContainer>
    )
  } else if (path === '/search' || path.startsWith('/archive')) {
    const query = url.searchParams.get('q') || undefined,
      year = /^\/archive\/\d{4}$/.test(path) ? Number(path.slice(9)) : undefined
    content = (
      <MainContainer site={config.site}>
        <h1>{query ? `Pencarian: ${query}` : 'Arsip'}</h1>
        <PostList
          result={await getPosts({ query, year, page })}
          basePath={path}
          query={query}
          appearance={config}
          preview
        />
      </MainContainer>
    )
  } else if (path === '/bookmarks') {
    content = (
      <MainContainer site={config.site}>
        <h1>Bacaan tersimpan</h1>
        <p>
          Daftar bacaan tersimpan tersedia di situs publik. Pratinjau tidak mengubah bacaan Anda.
        </p>
      </MainContainer>
    )
  } else {
    const staticPage = await getPage(path.slice(1))
    content = (
      <MainContainer site={config.site}>
        {staticPage &&
        settings.showOnFront === 'page' &&
        staticPage.id === settings.pageForPosts ? (
          <>
            <h1>{staticPage.title}</h1>
            <PostList
              result={await getPosts({ page })}
              basePath={path}
              appearance={config}
              preview
            />
          </>
        ) : staticPage ? (
          <article className="panel">
            <h1>{staticPage.title}</h1>
            <PostContent html={staticPage.content} />
          </article>
        ) : (
          <>
            <h1>Halaman tidak ditemukan</h1>
            <p>Pilih tautan lain di preview.</p>
          </>
        )}
      </MainContainer>
    )
  }
  const init = `document.documentElement.dataset.mode=${JSON.stringify(config.site.defaultMode)};document.documentElement.dataset.theme=${JSON.stringify(config.site.defaultTheme)};`
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: init }} />
      <PreviewNavigation revision={draft.revision} />
      <div className="previewNotice">
        Preview rancangan · Perubahan belum diterapkan ke situs publik
      </div>
      <SiteFrame settings={{ ...settings, ...config.site }} appearance={config} preview>
        {content}
      </SiteFrame>
    </>
  )
}
