import { publicRoute, publicRouteMetadata } from '@/lib/content/public-route'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return publicRouteMetadata(`/blog/${(await params).slug}`)
}
export default async function Article({ params }: { params: Promise<{ slug: string }> }) {
  return publicRoute(`/blog/${(await params).slug}`)
}
