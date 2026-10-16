import type { Metadata } from 'next'
import Link from 'next/link'
import { getArchiveYears } from '@/lib/db/queries/posts'
import { MainContainer } from '@/components/layout/MainContainer'
import { SiteFrame } from '@/components/site/SiteFrame'
import { publicPageMetadata } from '@/lib/content/metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({
    title: 'Arsip',
    description: 'Jelajahi seluruh artikel berdasarkan tahun terbit.',
    path: '/archive',
  })
}

export default async function Archive() {
  const years = await getArchiveYears()
  return (
    <SiteFrame>
      <MainContainer>
        <h1>Arsip</h1>
        {years.length ? (
          <ul>
            {years.map((y) => (
              <li key={y.year}>
                <Link href={`/archive/${y.year}`}>
                  {y.year} ({y.count} artikel)
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>Belum ada artikel.</p>
        )}
      </MainContainer>
    </SiteFrame>
  )
}
