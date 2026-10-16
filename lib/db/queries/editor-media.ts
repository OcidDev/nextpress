import 'server-only'
import { and, desc, ilike, or } from 'drizzle-orm'
import { requireCapability } from '@/lib/admin'
import { mediaScope } from './cms-scope'
import { getDb } from '@/lib/db'
import { media } from '@/lib/db/schema'

export async function editorMedia(search: string, page: number) {
  const session = await requireCapability('upload_files')
  const pageSize = 24
  const pattern = search
    .trim()
    .slice(0, 120)
    .replace(/[\\%_]/g, '\\$&')
  const rows = await getDb()
    .select({
      id: media.id,
      name: media.name,
      alt: media.alt,
      title: media.title,
      caption: media.caption,
      description: media.description,
      width: media.width,
      height: media.height,
      size: media.size,
    })
    .from(media)
    .where(
      and(
        mediaScope(session.user),
        pattern
          ? or(
              ilike(media.name, `%${pattern}%`),
              ilike(media.title, `%${pattern}%`),
              ilike(media.alt, `%${pattern}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(media.createdAt), desc(media.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize)
  return { items: rows.slice(0, pageSize), page, hasNext: rows.length > pageSize }
}
