import { publicRoute, publicRouteMetadata } from '@/lib/content/public-route'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ missing: string[] }> }) {
  return publicRouteMetadata(`/${(await params).missing.join('/')}`)
}
export default async function Page({ params }: { params: Promise<{ missing: string[] }> }) {
  return publicRoute(`/${(await params).missing.join('/')}`)
}
