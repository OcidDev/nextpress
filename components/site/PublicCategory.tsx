import { getSettings } from '@/lib/db/queries/settings'
import { enforceCanonical } from '@/lib/content/canonical'
import { SiteFrame } from '@/components/site/SiteFrame'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCategory, getPosts, pageNumber } from '@/lib/db/queries/posts'
import { PostList } from '@/components/blog/PostList'
import { MainContainer } from '@/components/layout/MainContainer'
import { publicPageMetadata } from '@/lib/content/metadata'
export const dynamic = 'force-dynamic'
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const category = await getCategory((await params).slug)
  if (!category) return { title: 'Kategori tidak ditemukan', robots: { index: false } }
  return publicPageMetadata({
    title: category.name,
    description: category.description || `Artikel dalam kategori ${category.name}.`,
    path: `/${(await getSettings()).categoryBase || 'category'}/${category.slug}`,
    page: pageNumber((await searchParams).page),
  })
}
export default async function Category({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const slug = (await params).slug
  const category = await getCategory(slug)
  if (!category) notFound()
  const basePath = `/${(await getSettings()).categoryBase || 'category'}/${slug}`
  await enforceCanonical(basePath, 'not-found')
  const result = await getPosts({ categorySlug: slug, page: pageNumber((await searchParams).page) })
  return (
    <SiteFrame>
      <MainContainer>
        <h1>{category.name}</h1>
        <p>{category.description}</p>
        <PostList result={result} basePath={basePath} />
      </MainContainer>
    </SiteFrame>
  )
}
