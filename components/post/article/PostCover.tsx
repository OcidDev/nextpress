import Image from 'next/image'
import type { Post } from '@/types'
import styles from '../ArticleContent.module.css'

/** Rasio gambar unggulan; `original` mempertahankan perilaku halaman sekarang. */
export const coverAspectRatios = ['16/9', '3/2', '4/3', '1/1', 'original'] as const

export type CoverAspectRatio = (typeof coverAspectRatios)[number]

/**
 * Gambar unggulan artikel.
 *
 * Dipisah dari `ArticleContent` supaya markup-nya dapat dipakai ulang oleh blok
 * tema `core/post-featured-image` (sprint EXT-03). Atribut `data-aspect` selalu
 * ditulis — termasuk `original` — supaya markup halaman dan markup blok identik
 * dan dapat dibandingkan apa adanya; hanya nilai selain `original` yang punya
 * aturan CSS (`ArticleContent.module.css`).
 */
export function PostCover({
  post,
  aspectRatio = 'original',
}: {
  post: Post
  aspectRatio?: CoverAspectRatio
}) {
  if (!post.featuredImage) return null
  return (
    <Image
      unoptimized
      width={1200}
      height={660}
      src={post.featuredImage}
      alt={post.featuredImageAlt || post.title}
      className={styles.cover}
      data-aspect={aspectRatio}
    />
  )
}
