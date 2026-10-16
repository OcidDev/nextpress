import styles from '../ArticleContent.module.css'

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

/**
 * Judul artikel yang tampil di halaman.
 *
 * Dipisah dari `ArticleContent` supaya markup-nya dapat dipakai ulang oleh blok
 * tema `core/post-title` (sprint EXT-03). Yang diberikan adalah judul **setelah**
 * filter `the_title`, bukan `post.title` mentah: metadata, atribut `alt`, dan
 * tautan berbagi tetap memakai judul aslinya.
 */
export function PostTitle({ title, level = 1 }: { title: string; level?: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const Tag = `h${level}` as HeadingTag
  return <Tag className={styles.title}>{title}</Tag>
}
