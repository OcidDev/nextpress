import { getAuth } from '@/lib/auth'
export const runtime = 'nodejs'
async function handler(request: Request) {
  // Native form submission must remain safe before hydration and without JS.
  // Use the HTTP handler so Better Auth still enforces CSRF and rate limits.
  const isLoginForm =
    request.method === 'POST' &&
    new URL(request.url).pathname === '/api/auth/sign-in/email' &&
    request.headers.get('content-type')?.split(';', 1)[0]?.trim() ===
      'application/x-www-form-urlencoded'
  const response = await getAuth().handler(request)
  if (!isLoginForm) return response

  const headers = new Headers(response.headers)
  headers.delete('content-type')
  headers.delete('content-length')
  headers.set('Cache-Control', 'no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set(
    'Location',
    response.ok
      ? '/admin'
      : `/admin/login?notice=${response.status === 429 ? 'rate_limited' : 'login_failed'}`,
  )
  // Preserve Set-Cookie, but never echo the submitted fields or session token.
  return new Response(null, { status: 303, headers })
}
export { handler as GET, handler as POST }
