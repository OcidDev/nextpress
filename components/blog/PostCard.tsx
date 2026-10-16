import Image from 'next/image'
import Link from 'next/link'
import type { PostSummary } from '@/types'
import { formatDate } from '@/lib/utils'
import { ArrowRightIcon } from '@/components/ui/icons/ArrowRightIcon'
import { EditAltIcon } from '@/components/ui/icons/EditAltIcon'
import { EyeIcon } from '@/components/ui/icons/EyeIcon'
import { ProfileIcon } from '@/components/ui/icons/ProfileIcon'
import { VerifiedIcon } from '@/components/ui/icons/VerifiedIcon'
import { BookmarkButton } from './BookmarkButton'
import styles from './PostList.module.css'

export type CardOptions = {
  bookmarks?: boolean
  showViews?: boolean
  editable?: boolean
  preview?: boolean
}
export function PostCard({
  post,
  variant = 'standard',
  options = {},
}: {
  post: PostSummary
  variant?: 'standard' | 'pinned'
  options?: CardOptions
}) {
  const href = post.permalink || `/blog/${post.slug}`
  return (
    <article
      className={`cmsPostCard ${styles.card} ${variant === 'pinned' ? styles.pinned : ''}`}
      data-post-id={post.id}
    >
      <div className={styles.thumbnail}>
        <Link href={href} className={styles.imageLink} aria-label={post.title}>
          {post.featuredImage ? (
            <Image
              unoptimized
              width={1200}
              height={660}
              src={post.featuredImage}
              alt={post.featuredImageAlt || post.title}
              loading="lazy"
              className={styles.cover}
            />
          ) : (
            <span className={styles.placeholder}>Tanpa gambar</span>
          )}
        </Link>
        <div className={styles.overlayActions}>
          {options.showViews && (
            <span className={styles.views} aria-label={`${post.viewCount} kali dibaca`}>
              <EyeIcon aria-hidden="true" />
              <span>{post.viewCount.toLocaleString('id-ID')}</span>
            </span>
          )}
          {options.bookmarks && !options.preview && <BookmarkButton post={post} />}
        </div>
        {options.editable && !options.preview && (
          <Link
            className={`${styles.iconButton} ${styles.quickEdit}`}
            href={`/admin/posts/${post.id}`}
            aria-label={`Edit artikel: ${post.title}`}
            title="Edit artikel"
          >
            <EditAltIcon aria-hidden="true" />
          </Link>
        )}
        <Link className={styles.authorChip} href={`/author/${post.author.slug}`}>
          {post.author.avatar ? (
            <Image unoptimized width={20} height={20} src={post.author.avatar} alt="" />
          ) : (
            <ProfileIcon aria-hidden="true" />
          )}
          <span>{post.author.name}</span>
          {post.author.verified && (
            <VerifiedIcon className={styles.verified} aria-label="Penulis terverifikasi" />
          )}
        </Link>
      </div>
      <div className={styles.cardBody}>
        {post.categories.length > 0 && (
          <div className={styles.labels}>
            <span>Kategori </span>
            {post.categories.slice(0, 2).map((category, index) => (
              <span key={category.id}>
                {index > 0 && ' / '}
                <Link href={category.permalink || `/category/${category.slug}`}>
                  {category.name}
                </Link>
              </span>
            ))}
          </div>
        )}
        <h2 className={styles.title}>
          <Link href={href}>{post.title}</Link>
        </h2>
        {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
        <div className={styles.cardFooter}>
          <time
            dateTime={post.publishedAt}
            title={`Diterbitkan ${post.publishedLabel || formatDate(post.publishedAt)}`}
          >
            <span className={styles.published}>Terbit</span>
            {post.publishedLabel || formatDate(post.publishedAt)}
          </time>
          <Link className={styles.readMore} href={href}>
            Baca Selanjutnya
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  )
}
