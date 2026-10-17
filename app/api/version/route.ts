import { NextResponse } from 'next/server'
import { installedVersion } from '@/lib/updates/versions'

// Public on purpose: the update flow verifies that the deployment which is
// actually serving traffic runs the expected version. It exposes nothing but the
// application version.
export function GET() {
  return NextResponse.json(
    { name: 'nextpress', version: installedVersion },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
