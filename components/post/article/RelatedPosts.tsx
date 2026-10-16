import Image from 'next/image'
import Link from 'next/link'
import type { ArticleLink } from '@/lib/db/queries/related-posts'
import { SectionHeading } from '@/components/site/SectionHeading'
import styles from '../ArticleContent.module.css'

/**
 * Daftar artikel terkait di bawah artikel.
 *
 * Dipisah dari `ArticleContent` supaya markup-nya dapat dipakai ulang oleh blok
 * tema `core/related-posts` (sprint EXT-03). Sumber datanya tetap
 * `getArticleNeighbors` — blok tidak mengulang logika query, ia hanya membatasi
 * berapa kartu yang ditampilkan. Tipe `ArticleLink` (bukan `PostSummary`) datang
 * dari query itu sendiri supaya komponen ini tidak menuntut kolom yang tidak
 * pernah diambil.
 */
export function RelatedPosts({ items, limit }: { items: ArticleLink[]; limit?: number }) {
  const visible = typeof limit === 'number' ? items.slice(0, limit) : items
  if (!visible.length) return null
  return (
    <section className={styles.related}>
      <SectionHeading>Artikel terkait</SectionHeading>
      <div className={styles.relatedCards}>
        {visible.map((related) => (
          <article key={related.id}>
            {related.featuredImage && (
              <Link href={related.permalink || `/blog/${related.slug}`}>
                <Image
                  unoptimized
                  width={600}
                  height={330}
                  src={related.featuredImage}
                  alt={related.featuredImageAlt || related.title}
                  loading="lazy"
                />
              </Link>
            )}
            <h3>
              <Link href={related.permalink || `/blog/${related.slug}`}>{related.title}</Link>
            </h3>
            <p>{related.excerpt}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
