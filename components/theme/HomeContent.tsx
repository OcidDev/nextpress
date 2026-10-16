import { getSettings } from '@/lib/db/queries/settings'
import Link from 'next/link'
import Image from 'next/image'
import type { Appearance, Section } from '@/lib/content/appearance'
import { getHomePostCollection, getHomePostsPage, getPosts } from '@/lib/db/queries/posts'
import { getPublicPageById } from '@/lib/db/queries/theme'
import { getAdminSession } from '@/lib/admin'
import { getViewStats } from '@/lib/db/queries/views'
import type { Paginated, PostSummary } from '@/types'
import { MainContainer } from '@/components/layout/MainContainer'
import { Sidebar } from '@/components/layout/Sidebar'
import { PostList } from '@/components/blog/PostList'
import { PostCard } from '@/components/blog/PostCard'
import { PostContent } from '@/components/post/PostContent'
import { Widgets } from './Widgets'
import { PluginSlot, PluginWidget } from './PluginSlot'
import { SectionHeading } from './SectionHeading'

async function HomeSection({
  section,
  page,
  hasHero,
  preview,
  appearance,
  collection,
  latestResult,
}: {
  section: Section
  page: number
  hasHero: boolean
  preview: boolean
  appearance: Appearance
  collection: Awaited<ReturnType<typeof getHomePostCollection>>
  latestResult: Paginated<PostSummary> | null
}) {
  switch (section.type) {
    case 'plugin':
      return (
        <PluginWidget
          pluginId={section.pluginId}
          widgetId={section.widgetId}
          title={section.title}
          preview={preview}
          variant="section"
        />
      )
    case 'hero':
      return (
        <section className="themeHero panel">
          {section.image && (
            <Image unoptimized src={section.image} alt={section.alt} width={1200} height={675} />
          )}
          <div>
            <h1>{section.title}</h1>
            <p style={{ whiteSpace: 'pre-wrap' }}>{section.text}</p>
            {section.buttonLabel && section.buttonHref && (
              <Link className="button" href={section.buttonHref}>
                {section.buttonLabel}
              </Link>
            )}
          </div>
        </section>
      )
    case 'latest': {
      if (!latestResult) return null
      const result = latestResult
      const title =
        section.id === 'home-latest' && !result.total
          ? 'Ruang untuk membaca dan berbagi'
          : section.title
      return (
        <section className="themeSection">
          <SectionHeading as={hasHero ? 'h2' : 'h1'}>{title}</SectionHeading>
          <PostList
            result={result}
            layout={section.layout}
            context="home"
            appearance={appearance}
            preview={preview}
            feed={
              section.pagination === 'load-more'
                ? { endpoint: preview ? '/api/posts?preview=1' : '/api/posts', key: collection.key }
                : undefined
            }
          />
        </section>
      )
    }
    case 'featured': {
      if (section.presentation === 'pinned' && page !== 1) return null
      const post = collection.featured.find((item: PostSummary) => item.id === section.postId)
      if (!post)
        return preview ? (
          <section className="themeSection">
            <SectionHeading>{section.title}</SectionHeading>
            <div className="panel">Artikel unggulan belum tersedia.</div>
          </section>
        ) : null
      return (
        <section className="themeSection">
          <SectionHeading>{section.title}</SectionHeading>
          {section.presentation === 'pinned' ? (
            <PostCard
              post={post}
              variant="pinned"
              options={{
                bookmarks: appearance.cards.bookmarks,
                showViews:
                  appearance.cards.showViews &&
                  appearance.site.viewsEnabled &&
                  (await getViewStats()).available,
                editable:
                  !preview && appearance.cards.quickEdit && Boolean(await getAdminSession()),
                preview,
              }}
            />
          ) : (
            <PostList
              result={{ items: [post], page: 1, perPage: 1, total: 1, totalPages: 1 }}
              layout={section.layout}
              paginate={false}
              appearance={appearance}
              preview={preview}
            />
          )}
        </section>
      )
    }
    case 'category': {
      const result = section.categorySlug
        ? await getPosts({ categorySlug: section.categorySlug, perPage: section.limit })
        : { items: [], page: 1, perPage: section.limit, total: 0, totalPages: 0 }
      return (
        <section className="themeSection">
          <SectionHeading>{section.title}</SectionHeading>
          <PostList
            result={result}
            layout={section.layout}
            paginate={false}
            appearance={appearance}
            preview={preview}
          />
          {section.categorySlug && (
            <Link
              className="themeSectionLink"
              href={`/${(await getSettings()).categoryBase || 'category'}/${section.categorySlug}`}
            >
              Lihat semua artikel →
            </Link>
          )}
        </section>
      )
    }
  }
}
export async function HomeSections({
  appearance,
  page = 1,
  preview = false,
}: {
  appearance: Appearance
  page?: number
  preview?: boolean
}) {
  const featuredIds = new Set<string>()
  const active = appearance.home.sections.filter((section) => {
    if (!section.enabled) return false
    if (section.type !== 'featured' || section.presentation !== 'pinned' || !section.postId)
      return true
    if (featuredIds.has(section.postId)) return false
    featuredIds.add(section.postId)
    return true
  })
  const { collection, result: latestResult } = await getHomePostsPage(appearance, page)
  const staticPage =
    appearance.home.mode === 'page' ? await getPublicPageById(appearance.home.pageId) : null
  const hasHero = active.some((section) => section.type === 'hero')
  return (
    <>
      <PluginSlot slot="home-top" preview={preview} />
      {appearance.home.mode === 'page' ? (
        staticPage ? (
          <article className="panel">
            <h1>{staticPage.title}</h1>
            <PostContent html={staticPage.content} />
          </article>
        ) : (
          <div className="panel">
            <h1>Halaman beranda belum tersedia</h1>
            <p>Pilih halaman beranda melalui pengaturan Tampilan.</p>
          </div>
        )
      ) : active.length ? (
        active.map((section) => (
          <HomeSection
            key={section.id}
            section={section}
            page={page}
            hasHero={hasHero}
            preview={preview}
            appearance={appearance}
            collection={collection}
            latestResult={latestResult}
          />
        ))
      ) : (
        <div className="panel">
          <h1>{appearance.site.name}</h1>
          <p>{appearance.site.description}</p>
        </div>
      )}
      <PluginSlot slot="home-bottom" preview={preview} />
    </>
  )
}

// Retained for the appearance draft preview; public home uses template blocks.
export async function HomeContent({
  appearance,
  page = 1,
  preview = false,
}: {
  appearance: Appearance
  page?: number
  preview?: boolean
}) {
  return (
    <MainContainer
      site={appearance.site}
      announcement={appearance.announcement}
      sidebar={
        appearance.sidebar.some((w) => w.enabled) ? (
          <Sidebar>
            <Widgets items={appearance.sidebar} site={appearance.site} preview={preview} />
          </Sidebar>
        ) : undefined
      }
    >
      <HomeSections appearance={appearance} page={page} preview={preview} />
    </MainContainer>
  )
}
