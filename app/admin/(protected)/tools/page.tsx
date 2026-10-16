import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'

const toolTabs = [
  { slug: '', label: 'Peralatan Tersedia' },
  { slug: 'import', label: 'Impor' },
  { slug: 'export', label: 'Ekspor' },
  { slug: 'health', label: 'Kesehatan Situs' },
]

export default async function ToolsPage() {
  await requireAdmin()

  return (
    <>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">PERALATAN SISTEM</p>
          <h1>Peralatan yang Tersedia</h1>
        </div>
      </div>

      <nav className="adminStatusTabs" aria-label="Menu Peralatan">
        {toolTabs.map((tab) => (
          <Link
            key={tab.slug}
            href={`/admin/tools${tab.slug ? `/${tab.slug}` : ''}`}
            aria-current={tab.slug === '' ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gap: '1.5rem',
          marginTop: '1.5rem',
        }}
      >
        <div
          style={{
            padding: '1.5rem',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            background: '#ffffff',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', marginTop: 0 }}>Impor Konten</h2>
          <p style={{ color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Impor pos, laman, komentar, dan istilah taksonomi dari platform blog lain seperti
            WordPress (WXR XML) atau Google Blogger (Atom XML).
          </p>
          <Link
            href="/admin/tools/import"
            className="button"
            style={{ display: 'inline-block', marginTop: '1rem' }}
          >
            Buka Pengimpor &rarr;
          </Link>
        </div>

        <div
          style={{
            padding: '1.5rem',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            background: '#ffffff',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', marginTop: 0 }}>Ekspor Konten</h2>
          <p style={{ color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Ekspor pos, laman, dan taksonomi situs Anda ke dalam format standar WordPress eXtended
            RSS (WXR 1.2 XML) untuk cadangan data atau migrasi.
          </p>
          <Link
            href="/admin/tools/export"
            className="button"
            style={{ display: 'inline-block', marginTop: '1rem' }}
          >
            Buka Pengekspor &rarr;
          </Link>
        </div>

        <div
          style={{
            padding: '1.5rem',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            background: '#ffffff',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', marginTop: 0 }}>Kesehatan Situs</h2>
          <p style={{ color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Periksa performa dan keamanan konfigurasi CMS Anda, status koneksi basis data
            PostgreSQL, serta informasi runtime lingkungan sistem.
          </p>
          <Link
            href="/admin/tools/health"
            className="button"
            style={{ display: 'inline-block', marginTop: '1rem' }}
          >
            Lihat Laporan Kesehatan &rarr;
          </Link>
        </div>
      </div>
    </>
  )
}
