import type { Appearance } from '@/lib/content/appearance'
import type { Post } from '@/types'
import { CommentSection } from '@/components/comments/CommentSection'
import styles from '../ArticleContent.module.css'

/**
 * Area komentar artikel.
 *
 * Dipisah dari `ArticleContent` supaya markup-nya dapat dipakai ulang oleh blok
 * tema `core/comments` (sprint EXT-03). Dua cabangnya sama seperti halaman
 * sekarang: komentar asli saat bukan preview, dan penjelasan statis saat preview
 * (pengiriman komentar tidak diaktifkan di preview).
 */
export function PostComments({
  post,
  appearance,
  preview = false,
}: {
  post: Post
  appearance: Appearance
  preview?: boolean
}) {
  if (!appearance.article.comments) return null
  if (preview)
    return (
      <section className="panel">
        <h2>Komentar</h2>
        <p>
          Komentar ditampilkan pada artikel publik. Pengiriman komentar dinonaktifkan di preview.
        </p>
      </section>
    )
  return (
    <div id="comments" className={styles.comments}>
      <CommentSection
        postId={post.id}
        allowComments={post.allowComments && appearance.site.commentsEnabled}
      />
    </div>
  )
}
