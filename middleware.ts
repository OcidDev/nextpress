import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  // Overwrite client values; used only to enforce the canonical slash/query form.
  headers.set('x-cms-request-path', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
