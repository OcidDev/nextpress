import { ThemePage } from '@/lib/themes/ThemePage'
import type { Metadata } from 'next'
import { MainContainer } from '@/components/layout/MainContainer'
import { PostList } from '@/components/blog/PostList'
import { getPosts, pageNumber } from '@/lib/db/queries/posts'
import { publicPageMetadata } from '@/lib/content/metadata'
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string }>
}): Promise<Metadata> {
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 200) : ''
  const path = query ? `/search?${new URLSearchParams({ q: query })}` : '/search'
  return publicPageMetadata({
    title: query ? `Pencarian: ${query}` : 'Pencarian',
    path,
    page: pageNumber(params.page),
    noIndex: true,
  })
}
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string }>
}) {
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 200) : ''
  const result = await getPosts({ query, page: pageNumber(params.page) })
  return (
    <ThemePage
      query={{ kind: 'search' }}
      context={{ archive: { result, basePath: '/search', query } }}
    >
      <MainContainer>
        <section className="panel">
          <h1>Cari artikel</h1>
          <form action="/search" method="get" role="search" className="searchForm">
            <label htmlFor="search-query">Kata kunci</label>
            <input
              id="search-query"
              type="search"
              name="q"
              defaultValue={query}
              maxLength={200}
              required
            />
            <button className="button">Cari</button>
          </form>
        </section>
        <PostList result={result} basePath="/search" query={query} />
      </MainContainer>
    </ThemePage>
  )
}
