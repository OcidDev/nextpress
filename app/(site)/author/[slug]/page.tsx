import { ThemePage } from '@/lib/themes/ThemePage'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAuthor, getPosts, pageNumber } from '@/lib/db/queries/posts'
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
  const author = await getAuthor((await params).slug)
  if (!author) return { title: 'Penulis tidak ditemukan', robots: { index: false } }
  return publicPageMetadata({
    title: author.name,
    description: author.bio || `Tulisan oleh ${author.name}.`,
    path: `/author/${author.slug}`,
    page: pageNumber((await searchParams).page),
  })
}
export default async function Author({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const slug = (await params).slug
  const author = await getAuthor(slug)
  if (!author) notFound()
  const result = await getPosts({ authorSlug: slug, page: pageNumber((await searchParams).page) })
  return (
    <ThemePage
      query={{ kind: 'author', authorSlug: slug, id: author.id }}
      context={{ archive: { result, basePath: `/author/${slug}` } }}
    >
      <MainContainer>
        <h1>{author.name}</h1>
        <p>{author.bio}</p>
        <PostList result={result} basePath={`/author/${slug}`} />
      </MainContainer>
    </ThemePage>
  )
}
