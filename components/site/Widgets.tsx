import Link from 'next/link'
import Image from 'next/image'
import { widgetLabels, type AppearanceSite, type Widget } from '@/lib/content/appearance'
import { getPosts, getArchiveYears } from '@/lib/db/queries/posts'
import { getPublicAuthorById, getPublicCategories } from '@/lib/db/queries/public'
import { getPopularPosts } from '@/lib/db/queries/views'
import { formatDate } from '@/lib/utils'
import { CategoryWidget } from './CategoryWidget'
import { StickyWidgets } from './StickyWidgets'

async function WidgetContent({
  widget,
  site,
  currentPostId,
}: {
  widget: Widget
  site: AppearanceSite
  currentPostId?: string
}) {
  switch (widget.type) {
    case 'about':
      return <p>{widget.text || site.description}</p>
    case 'text':
      return <p style={{ whiteSpace: 'pre-wrap' }}>{widget.text}</p>
    case 'image':
      return widget.image ? (
        <Image unoptimized src={widget.image} alt={widget.alt} width={800} height={600} />
      ) : (
        <p>Gambar belum tersedia.</p>
      )
    case 'recent': {
      const result = await getPosts({ perPage: widget.limit })
      return result.items.length ? (
        <ul>
          {result.items.map((post) => (
            <li key={post.id}>
              <Link href={post.permalink || `/blog/${post.slug}`}>{post.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Belum ada artikel.</p>
      )
    }
    case 'categories': {
      const categories = await getPublicCategories(widget.limit, widget.sort)
      return categories.length ? (
        <CategoryWidget
          categories={categories}
          initialCount={widget.initialCount}
          expandable={widget.expandable}
          showCounts={widget.showCounts}
        />
      ) : (
        <p>Belum ada kategori berisi artikel.</p>
      )
    }
    case 'popular': {
      const popular = await getPopularPosts({
        limit: widget.limit,
        range: widget.range,
        excludeId: currentPostId,
      })
      return popular.length ? (
        <ol className="themePopularList">
          {popular.map((post, index) => (
            <li key={post.id}>
              {index === 0 && post.featuredImage && (
                <Link
                  href={post.permalink || `/blog/${post.slug}`}
                  className="themePopularImage"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <Image unoptimized src={post.featuredImage} alt="" width={600} height={338} />
                </Link>
              )}
              <div className="themePopularMeta">
                <time dateTime={post.publishedAt}>
                  {post.publishedLabel || formatDate(post.publishedAt)}
                </time>
                {post.categories[0] && <span>{post.categories[0].name}</span>}
              </div>
              <div className="themePopularEntry">
                <span className="themePopularNumber" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>
                    <Link href={post.permalink || `/blog/${post.slug}`}>{post.title}</Link>
                  </h3>
                  {index === 0 && post.excerpt && <p>{post.excerpt}</p>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="themeWidgetEmpty">Belum ada bacaan populer.</p>
      )
    }
    case 'archive': {
      const years = await getArchiveYears()
      return years.length ? (
        <ul>
          {years.slice(0, widget.limit).map((year) => (
            <li key={year.year}>
              <Link href={`/archive/${year.year}`}>{year.year}</Link> <small>({year.count})</small>
            </li>
          ))}
        </ul>
      ) : (
        <p>Belum ada arsip.</p>
      )
    }
    case 'author': {
      const author = await getPublicAuthorById(widget.authorId)
      return author ? (
        <div>
          <Link href={`/author/${author.slug}`}>{author.name}</Link>
          <p>{author.bio}</p>
        </div>
      ) : (
        <p>Profil penulis belum tersedia.</p>
      )
    }
    case 'menu':
      return (
        <ul>
          {widget.links.map((link, index) => (
            <li key={index}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      )
    case 'social':
      return (
        <ul>
          {site.social.map((link, index) => (
            <li key={index}>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      )
  }
}
export async function Widgets({
  items,
  site,
  footer = false,
  currentPostId,
}: {
  items: Widget[]
  site: AppearanceSite
  footer?: boolean
  currentPostId?: string
}) {
  const enabled = items.filter((item) => item.enabled)
  const renderWidget = (widget: Widget) => (
    <section
      key={widget.id}
      className={`panel themeWidget themeWidget-${widget.type}`}
      data-widget-id={widget.id}
    >
      <h2>
        {widget.title ||
          (widget.type === 'about' ? `Tentang ${site.name}` : widgetLabels[widget.type])}
      </h2>
      <WidgetContent widget={widget} site={site} currentPostId={currentPostId} />
    </section>
  )
  const regular = enabled.filter((widget) => !widget.sticky)
  const sticky = enabled.filter((widget) => widget.sticky)
  return (
    <div className={footer ? 'themeFooterWidgets' : 'themeWidgets'}>
      {footer ? (
        enabled.map(renderWidget)
      ) : (
        <>
          {regular.length > 0 && (
            <div className="themeWidgetGroup">{regular.map(renderWidget)}</div>
          )}
          {sticky.length > 0 && <StickyWidgets>{sticky.map(renderWidget)}</StickyWidgets>}
        </>
      )}
    </div>
  )
}
