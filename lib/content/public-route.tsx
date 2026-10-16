import { enforceCanonical } from './canonical'
import 'server-only'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { findPublicPostRoute, findPublicTaxonomyRoute } from './permalink-server'
import Article, { generateMetadata as articleMetadata } from '@/components/post/PublicArticle'
import Page, { generateMetadata as pageMetadata } from '@/components/post/PublicPage'
import { getPage } from '@/lib/db/queries/posts'
import { getSettings } from '@/lib/db/queries/settings'
import Category, { generateMetadata as categoryMetadata } from '@/components/theme/PublicCategory'
import { getPosts, pageNumber } from '@/lib/db/queries/posts'
import { publicPageMetadata } from './metadata'
import { ThemePage } from '@/lib/themes/ThemePage'
import { MainContainer } from '@/components/layout/MainContainer'
import { PostList } from '@/components/blog/PostList'

async function taxonomy(path: string) {
  const term = await findPublicTaxonomyRoute(path)
  if (!term) return null
  const search = new URL((await headers()).get('x-cms-request-path') || '/', 'http://cms.local')
    .searchParams
  return {
    ...term,
    props: {
      params: Promise.resolve({ slug: term.slug }),
      searchParams: Promise.resolve({ page: search.get('page') || undefined }),
    },
  }
}

// Route params omit the trailing slash. Match the original request so a URL
// outside the configured structure is a 404, including slash and plain-ID forms.
async function requestedPath(fallback: string) {
  const original = (await headers()).get('x-cms-request-path')
  if (!original) return fallback
  const url = new URL(original, 'http://cms.local')
  return (
    url.pathname +
    (url.searchParams.has('p') ? `?p=${encodeURIComponent(url.searchParams.get('p')!)}` : '')
  )
}

export async function publicRouteMetadata(path: string) {
  path = await requestedPath(path)
  const term = await taxonomy(path)
  if (term?.kind === 'category') return categoryMetadata(term.props)
  if (term?.kind === 'tag')
    return publicPageMetadata({
      title: (await term.props.params).slug,
      path: term.canonical,
      page: pageNumber((await term.props.searchParams).page),
    })
  const post = await findPublicPostRoute(path)
  if (post) return articleMetadata({ params: Promise.resolve({ slug: post.slug }) })
  if (/^\/[^/?]+$/.test(path))
    return pageMetadata({ params: Promise.resolve({ slug: path.slice(1) }) })
  return { title: 'Halaman tidak ditemukan', robots: { index: false } }
}
export async function publicRoute(path: string) {
  path = await requestedPath(path)
  const term = await taxonomy(path)
  if (term?.kind === 'category') return Category(term.props)
  if (term?.kind === 'tag') {
    const { slug } = await term.props.params
    const result = await getPosts({
      tag: slug,
      page: pageNumber((await term.props.searchParams).page),
    })
    if (!result.total) notFound()
    const basePath = `/${(await getSettings()).tagBase || 'tag'}/${slug}`
    await enforceCanonical(basePath, 'not-found')
    return (
      <ThemePage
        query={{ kind: 'tag', termSlug: slug }}
        context={{ archive: { result, basePath } }}
      >
        <MainContainer>
          <h1>Tag: {slug}</h1>
          <PostList result={result} basePath={basePath} />
        </MainContainer>
      </ThemePage>
    )
  }
  const post = await findPublicPostRoute(path)
  if (post) {
    return Article({ params: Promise.resolve({ slug: post.slug }) })
  }
  if (/^\/[^/?]+$/.test(path) && (await getPage(path.slice(1)))) {
    return Page({ params: Promise.resolve({ slug: path.slice(1) }) })
  }
  notFound()
}
