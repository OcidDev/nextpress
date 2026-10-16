import { bootExtensions } from '@/lib/extensions/bootstrap'
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  await bootExtensions()
  return children
}
