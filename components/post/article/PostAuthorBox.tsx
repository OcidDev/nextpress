import Image from 'next/image'
import Link from 'next/link'
import type { Post } from '@/types'
import { ProfileIcon } from '@/components/ui/icons/ProfileIcon'
import styles from '../ArticleContent.module.css'

/**
 * Kotak "Tentang penulis" di bawah artikel.
 *
 * Dipisah dari `ArticleContent` supaya markup-nya dapat dipakai ulang oleh blok
 * tema `core/post-author` (sprint EXT-03). `showBio` bawaan `true` sama dengan
 * perilaku halaman sekarang; `false` menyembunyikan biografi tetapi tetap
 * menampilkan peran penulis.
 */
export function PostAuthorBox({ post, showBio = true }: { post: Post; showBio?: boolean }) {
  return (
    <section className={styles.author} aria-label="Tentang penulis">
      {post.author.avatar ? (
        <Image unoptimized width={55} height={55} src={post.author.avatar} alt="" />
      ) : (
        <ProfileIcon aria-hidden="true" />
      )}
      <div>
        <h2>
          <Link href={`/author/${post.author.slug}`}>{post.author.name}</Link>
        </h2>
        {post.author.role && <p>{post.author.role}</p>}
        {showBio && post.author.bio && <p>{post.author.bio}</p>}
      </div>
    </section>
  )
}
