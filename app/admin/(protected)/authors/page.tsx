import { requireAdmin } from '@/lib/admin'
import { redirect } from 'next/navigation'

export default async function AuthorsRedirectPage() {
  await requireAdmin()
  redirect('/admin/users')
}
