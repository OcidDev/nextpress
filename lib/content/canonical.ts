import 'server-only'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'

export async function enforceCanonical(
  path: string,
  mismatch: 'redirect' | 'not-found' = 'redirect',
) {
  const original = (await headers()).get('x-cms-request-path')
  if (!original) return
  const request = new URL(original, 'http://cms.local')
  const target = new URL(path, 'http://cms.local')
  if (
    request.pathname === target.pathname &&
    request.searchParams.get('p') === target.searchParams.get('p')
  )
    return
  if (mismatch === 'not-found') notFound()
  for (const [key, value] of request.searchParams) {
    if (key !== 'p' && !target.searchParams.has(key)) target.searchParams.append(key, value)
  }
  permanentRedirect(target.pathname + target.search)
}
