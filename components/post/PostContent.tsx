import { bootExtensions } from '@/lib/extensions/bootstrap'
import { filteredContentHtml } from '@/lib/extensions/content'
import styles from './PostContent.module.css'

/**
 * Isi artikel. Jalurnya lewat `the_content` (EXT-01) sehingga ekstensi dapat
 * mengubah HTML — hasilnya tetap disanitasi `cleanHtml` setelah filter.
 */
export async function PostContent({ html }: { html: string }) {
  await bootExtensions()
  return (
    <div
      className={`${styles.content} cmsRichContent`}
      dangerouslySetInnerHTML={{ __html: await filteredContentHtml(html) }}
    />
  )
}
