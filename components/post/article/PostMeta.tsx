import Image from 'next/image'
import Link from 'next/link'
import type { Appearance } from '@/lib/content/appearance'
import { getAdminSession } from '@/lib/admin'
import { formatDate } from '@/lib/utils'
import type { Post } from '@/types'
import { BookmarkButton } from '@/components/blog/BookmarkButton'
import { ChatIcon } from '@/components/ui/icons/ChatIcon'
import { ProfileIcon } from '@/components/ui/icons/ProfileIcon'
import { VerifiedIcon } from '@/components/ui/icons/VerifiedIcon'
import { EditAltIcon } from '@/components/ui/icons/EditAltIcon'
import { PostShare } from '../PostShare'
import styles from '../ArticleContent.module.css'

/**
 * Baris metadata artikel: avatar, nama penulis, tanggal, dan aksi.
 *
 * Dipisah dari `ArticleContent` supaya markup-nya dapat dipakai ulang oleh blok
 * tema `core/post-meta` (sprint EXT-03). Turunan `showComments` dan `editable`
 * dihitung **di dalam** komponen, bukan oleh pemanggil: kalau pemanggil yang
 * menghitung, halaman dan blok bisa berbeda pendapat dan markup-nya diam-diam
 * menyimpang. `showAuthor` dan `showDate` bawaan `true` — sama dengan halaman
 * sekarang; `false` menyembunyikan tautan penulis atau kedua tanggal, sementara
 * waktu baca selalu tampil karena ia bagian dari baris tanggal yang sama.
 */
export async function PostMeta({
  post,
  shareUrl,
  appearance,
  preview = false,
  showAuthor = true,
  showDate = true,
}: {
  post: Post
  /** URL absolut untuk tombol berbagi. */
  shareUrl: string
  appearance: Appearance
  preview?: boolean
  showAuthor?: boolean
  showDate?: boolean
}) {
  const showComments = appearance.article.comments && !preview
  const editable = !preview && appearance.cards.quickEdit && Boolean(await getAdminSession())
  const updated =
    post.updatedAt && new Date(post.updatedAt).getTime() > new Date(post.publishedAt).getTime()
      ? post.updatedAt
      : null
  return (
    <div className={styles.metadata}>
      {showAuthor && (
        <Link
          className={styles.avatar}
          href={`/author/${post.author.slug}`}
          aria-label={`Profil ${post.author.name}`}
        >
          {post.author.avatar ? (
            <Image unoptimized width={28} height={28} src={post.author.avatar} alt="" />
          ) : (
            <ProfileIcon aria-hidden="true" />
          )}
        </Link>
      )}
      <div className={styles.byline}>
        {showAuthor && (
          <Link href={`/author/${post.author.slug}`} className={styles.authorName}>
            {post.author.name}
            {post.author.verified && (
              <VerifiedIcon className={styles.verified} aria-label="Penulis terverifikasi" />
            )}
          </Link>
        )}
        <div className={styles.date}>
          {showDate && (
            <time dateTime={post.publishedAt}>
              Terbit {post.publishedLabel || formatDate(post.publishedAt)}
            </time>
          )}
          {showDate && updated && (
            <time dateTime={updated}>Diperbarui {post.updatedLabel || formatDate(updated)}</time>
          )}
          <span>{post.readingTime} menit baca</span>
        </div>
      </div>
      <div className={styles.actions}>
        {appearance.article.bookmarks && !preview && <BookmarkButton post={post} />}
        {showComments && (
          <a
            className={styles.action}
            href="#comments"
            aria-label={`Komentar (${post.commentCount})`}
            title="Komentar"
          >
            <ChatIcon aria-hidden="true" />
            {post.commentCount > 0 && <span>{post.commentCount}</span>}
          </a>
        )}
        {appearance.article.share && !preview && (
          <PostShare title={post.title} url={shareUrl} compact />
        )}
        {editable && (
          <Link
            className={styles.action}
            href={`/admin/posts/${post.id}`}
            aria-label="Edit artikel"
            title="Edit artikel"
          >
            <EditAltIcon aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  )
}
