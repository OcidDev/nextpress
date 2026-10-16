import { ThemePage } from '@/lib/themes/ThemePage'
import Link from 'next/link'
import { MainContainer } from '@/components/layout/MainContainer'

export default function NotFound() {
  return (
    <ThemePage query={{ kind: '404' }}>
      <MainContainer>
        <div className="panel emptyState">
          <span>404</span>
          <h1>Halaman tidak ditemukan</h1>
          <p>Halaman yang Anda cari tidak tersedia.</p>
          <Link className="button" href="/">
            Kembali ke beranda
          </Link>
        </div>
      </MainContainer>
    </ThemePage>
  )
}
