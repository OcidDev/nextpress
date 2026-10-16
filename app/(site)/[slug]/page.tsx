import { publicRoute, publicRouteMetadata } from '@/lib/content/public-route'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return publicRouteMetadata(`/${(await params).slug}`)
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return publicRoute(`/${(await params).slug}`)
}
