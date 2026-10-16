import styles from './PostContent.module.css'

/** Isi artikel; HTML sudah tersanitasi oleh `buildArticleContent`. */
export function PostContent({ html }: { html: string }) {
  return (
    <div
      className={`${styles.content} cmsRichContent`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
