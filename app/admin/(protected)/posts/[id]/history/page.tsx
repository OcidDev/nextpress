import { ContentHistory } from '@/components/admin/ContentHistory'
export default async function History({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ revision?: string }>
}) {
  return (
    <ContentHistory kind="posts" id={(await params).id} selected={(await searchParams).revision} />
  )
}
