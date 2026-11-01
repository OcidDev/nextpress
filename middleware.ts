import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Clean legacy GET submissions before rendering pages or forwarding their URL.
  // This cannot remove credentials already recorded by a proxy or browser.
  if (
    request.nextUrl.pathname === '/admin/login' &&
    [...request.nextUrl.searchParams.keys()].some((key) =>
      ['email', 'username', 'password'].includes(key.toLowerCase()),
    )
  ) {
    const url = request.nextUrl.clone()
    url.search = ''
    const response = NextResponse.redirect(url, 303)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
  const headers = new Headers(request.headers)
  // Overwrite client values; used only to enforce the canonical slash/query form.
  headers.set('x-cms-request-path', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
