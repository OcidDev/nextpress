import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { authors, media, posts } from '@/lib/db/schema'
import { userHasCapability, type PrimitiveCapability } from '@/lib/core/roles'

type CmsUser = { id: string; role: string; capabilities?: readonly PrimitiveCapability[] }

export function postScope(owner: CmsUser) {
  if (!userHasCapability(owner, 'edit_posts')) return sql`false`
  return userHasCapability(owner, 'edit_others_posts')
    ? undefined
    : sql`exists (
    select 1 from ${authors} where ${authors.id} = ${posts.authorId} and ${authors.userId} = ${owner.id}
  )`
}

export function mediaScope(owner: CmsUser) {
  if (!userHasCapability(owner, 'upload_files')) return sql`false`
  return userHasCapability(owner, 'edit_others_posts') ? undefined : eq(media.uploadedBy, owner.id)
}
