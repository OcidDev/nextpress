import 'server-only'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAppearance } from '@/lib/db/queries/appearance'
import {
  getArchiveYears,
  getAuthor,
  getCategory,
  getPage,
  getPostBySlug,
  getPosts,
  pageNumber,
} from '@/lib/db/queries/posts'
import { getPublicPageById } from '@/lib/db/queries/theme'
import { getSettings } from '@/lib/db/queries/settings'
import { findPublicPostRoute, findPublicTaxonomyRoute } from '@/lib/content/permalink-server'
import { articleBlockContext } from '@/lib/blocks/load'
import type { BlockContext } from '@/lib/blocks/context'
import type { TemplateQueryContext } from '@/lib/core/templates'
import { HomeContent } from '@/components/theme/HomeContent'
import { ArticleContent } from '@/components/post/ArticleContent'
import { MainContainer } from '@/components/layout/MainContainer'
import { PostContent } from '@/components/post/PostContent'
import { PostList } from '@/components/blog/PostList'
import type { ReactNode } from 'react'

export async function themePreviewContext(
  raw = '/',
): Promise<{ query: TemplateQueryContext; context: Partial<BlockContext>; content: ReactNode }> {
  if (!/^\/(?!\/)/.test(raw) || /[\\\u0000-\u001f]/.test(raw)) notFound()
  const url = new URL(raw, 'http://cms.local')
  const path = url.pathname,
    page = pageNumber(url.searchParams.get('page'))
  const appearance = await getAppearance()
  const article = await findPublicPostRoute(
    path + (url.searchParams.has('p') ? `?p=${url.searchParams.get('p')}` : ''),
  )
  if (article) {
    const post = await getPostBySlug(article.slug)
    if (!post) notFound()
    return {
      query: { kind: 'single', id: post.id, slug: post.slug },
      context: await articleBlockContext(post, { preview: true, appearance }),
      content: <ArticleContent post={post} appearance={appearance} preview />,
    }
  }
  if (url.searchParams.has('p')) notFound()
  if (path === '/') {
    const staticPage =
      appearance.home.mode === 'page' ? await getPublicPageById(appearance.home.pageId) : null
    return {
      query: {
        kind: 'front_page',
        showOnFront: appearance.home.mode,
        id: staticPage?.id,
        slug: staticPage?.slug,
      },
      context: {
        preview: true,
        page: staticPage ?? undefined,
        archive: { result: await getPosts({ page }), context: 'home' },
      },
      content: <HomeContent appearance={appearance} preview page={page} />,
    }
  }
  const settings = await getSettings()
  let parts: string[]
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    notFound()
  }
  if (path === '/archive') {
    const years = await getArchiveYears()
    return {
      query: { kind: 'date' },
      context: { preview: true },
      content: (
        <MainContainer>
          <h1>Arsip</h1>
          <ul>
            {years.map((year) => (
              <li key={year.year}>
                <Link href={`/archive/${year.year}`}>
                  {year.year} ({year.count} artikel)
                </Link>
              </li>
            ))}
          </ul>
        </MainContainer>
      ),
    }
  }
  const authorSlug = parts.length === 2 && parts[0] === 'author' ? parts[1] : undefined
  const year = parts.length === 2 && parts[0] === 'archive' ? Number(parts[1]) : undefined
  if (authorSlug && !(await getAuthor(authorSlug))) notFound()
  if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 9999)) notFound()
  let postsPage: Awaited<ReturnType<typeof getPage>> = null
  if (parts.length === 1 && parts[0] !== 'search') {
    const content = await getPage(parts[0]!)
    if (!content) notFound()
    if (settings.showOnFront !== 'page' || content.id !== settings.pageForPosts)
      return {
        query: { kind: 'page', id: content.id, slug: content.slug },
        context: { preview: true, page: content },
        content: (
          <MainContainer>
            <h1>{content.title}</h1>
            <PostContent html={content.content} />
          </MainContainer>
        ),
      }
    postsPage = content
  }
  const term = await findPublicTaxonomyRoute(parts.join('/'))
  const category = term?.kind === 'category' ? term.slug : undefined
  const tag = term?.kind === 'tag' ? term.slug : undefined
  const search = path === '/search' ? url.searchParams.get('q') || '' : undefined
  if (category && !(await getCategory(category))) notFound()
  if (parts.length !== 1 && !category && !tag && !authorSlug && year === undefined) notFound()
  const result = await getPosts({
    page,
    categorySlug: category,
    tag,
    query: search,
    authorSlug,
    year,
  })
  return {
    query: {
      kind: category
        ? 'category'
        : tag
          ? 'tag'
          : authorSlug
            ? 'author'
            : year !== undefined
              ? 'date'
              : search !== undefined
                ? 'search'
                : 'home',
      authorSlug,
      termSlug: category || tag,
    },
    context: {
      preview: true,
      page: postsPage ?? undefined,
      archive: { result, basePath: path, query: search, postsPage: Boolean(postsPage) },
    },
    content: (
      <MainContainer>
        <PostList result={result} basePath={path} query={search} />
      </MainContainer>
    ),
  }
}
