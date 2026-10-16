import Link from 'next/link'
import type { Appearance } from '@/lib/content/appearance'
import { buildArticleContent } from '@/lib/content/article'
import { getAppearance } from '@/lib/db/queries/appearance'
import { getArticleNeighbors } from '@/lib/db/queries/related-posts'
import { getViewStats } from '@/lib/db/queries/views'
import { siteConfig } from '@/data/site-config'
import type { Post } from '@/types'
import { MainContainer } from '@/components/layout/MainContainer'
import { Sidebar } from '@/components/layout/Sidebar'
import { Widgets } from '@/components/site/Widgets'
import { BookmarkButton } from '@/components/blog/BookmarkButton'
import { ViewTracker } from '@/components/analytics/ViewTracker'
import { EyeIcon } from '@/components/ui/icons/EyeIcon'
import { PostContent } from './PostContent'
import { PostShare } from './PostShare'
import { PostAuthorBox } from './article/PostAuthorBox'
import { PostComments } from './article/PostComments'
import { PostCover } from './article/PostCover'
import { PostMeta } from './article/PostMeta'
import { PostTitle } from './article/PostTitle'
import { PostToc } from './article/PostToc'
import { RelatedPosts } from './article/RelatedPosts'
import styles from './ArticleContent.module.css'

export async function ArticleContent({
  post,
  appearance,
  preview = false,
}: {
  post: Post
  appearance?: Appearance
  preview?: boolean
}) {
  const config = appearance ?? (await getAppearance())
  const { html, headings } = buildArticleContent(post.content)
  const title = post.title
  const neighbors = preview
    ? { related: [], previous: null, next: null }
    : await getArticleNeighbors(post)
  const views =
    config.site.viewsEnabled && config.cards.showViews && !preview
      ? await getViewStats(post.id)
      : null
  const shareUrl = new URL(post.permalink || `/blog/${post.slug}`, siteConfig.url).href
  return (
    <MainContainer
      site={config.site}
      announcement={config.announcement}
      sidebar={
        config.article.sidebar && config.sidebar.some((widget) => widget.enabled) ? (
          <Sidebar>
            <Widgets items={config.sidebar} site={config.site} currentPostId={post.id} />
          </Sidebar>
        ) : undefined
      }
    >
      {!preview && (
        <ViewTracker
          enabled={config.site.viewsEnabled}
          postId={post.id}
          canonicalPath={post.permalink}
        />
      )}
      {config.article.toc && <PostToc key={post.id} headings={headings} />}
      <div className={styles.layout}>
        <article className={styles.article}>
          <header className={styles.header}>
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <Link href="/">Beranda</Link> /{' '}
              {post.categories[0] ? (
                <Link href={post.categories[0].permalink || `/category/${post.categories[0].slug}`}>
                  {post.categories[0].name}
                </Link>
              ) : (
                'Artikel'
              )}
            </nav>
            <PostTitle title={title} />
            {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
            {config.article.metadata && (
              <PostMeta post={post} shareUrl={shareUrl} appearance={config} preview={preview} />
            )}
          </header>
          {views?.available && views.articleTotal !== null && (
            <p className={styles.viewCount}>
              <EyeIcon aria-hidden="true" />
              {views.articleTotal.toLocaleString('id-ID')} kali dibaca
            </p>
          )}
          {config.article.cover && <PostCover post={post} />}
          <PostContent html={html} />
          {post.categories.length > 0 && (
            <div className={styles.labels}>
              {post.categories.map((category) => (
                <Link key={category.id} href={category.permalink || `/category/${category.slug}`}>
                  #{category.name}
                </Link>
              ))}
            </div>
          )}
          {post.tags.length > 0 && <p className={styles.tags}>Tag: {post.tags.join(', ')}</p>}
          {config.article.share && !preview && <PostShare title={post.title} url={shareUrl} />}
          {config.article.bookmarks && !preview && !config.article.metadata && (
            <BookmarkButton post={post} label />
          )}
          <PostAuthorBox post={post} />
        </article>
        {(neighbors.previous || neighbors.next) && (
          <nav aria-label="Artikel sebelumnya dan berikutnya" className={styles.adjacent}>
            {neighbors.previous && (
              <Link
                href={neighbors.previous.permalink || `/blog/${neighbors.previous.slug}`}
                data-direction="previous"
              >
                <small>Artikel sebelumnya</small>
                <strong>{neighbors.previous.title}</strong>
              </Link>
            )}
            {neighbors.next && (
              <Link
                href={neighbors.next.permalink || `/blog/${neighbors.next.slug}`}
                data-direction="next"
              >
                <small>Artikel berikutnya</small>
                <strong>{neighbors.next.title}</strong>
              </Link>
            )}
          </nav>
        )}
        <RelatedPosts items={neighbors.related} />
        <PostComments post={post} appearance={config} preview={preview} />
      </div>
    </MainContainer>
  )
}
