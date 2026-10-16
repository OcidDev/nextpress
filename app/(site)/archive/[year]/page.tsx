import { ThemePage } from '@/lib/themes/ThemePage'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPosts, pageNumber } from '@/lib/db/queries/posts'
import { MainContainer } from '@/components/layout/MainContainer'
import { PostList } from '@/components/blog/PostList'
import { publicPageMetadata } from '@/lib/content/metadata'
export const dynamic = 'force-dynamic'
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const year = Number((await params).year)
  if (!Number.isInteger(year) || year < 1900 || year > 9999)
    return { title: 'Arsip tidak ditemukan', robots: { index: false } }
  return publicPageMetadata({
    title: `Arsip ${year}`,
    description: `Artikel yang diterbitkan pada tahun ${year}.`,
    path: `/archive/${year}`,
    page: pageNumber((await searchParams).page),
  })
}
export default async function ArchiveYear({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const year = Number((await params).year)
  if (!Number.isInteger(year) || year < 1900 || year > 9999) notFound()
  const result = await getPosts({ year, page: pageNumber((await searchParams).page) })
  return (
    <ThemePage
      query={{ kind: 'date' }}
      context={{ archive: { result, basePath: `/archive/${year}` } }}
    >
      <MainContainer>
        <h1>Arsip {year}</h1>
        <PostList result={result} basePath={`/archive/${year}`} />
      </MainContainer>
    </ThemePage>
  )
}
