import { ImageResponse } from 'next/og'
import { getSettings } from '@/lib/db/queries/settings'

export const dynamic = 'force-dynamic'
export const alt = 'NextPress'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const settings = await getSettings()
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#f4f7fa',
        color: '#18324a',
        padding: '80px',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, color: '#2471a3', marginBottom: 28 }}>
        CATATAN · CERITA · PENGETAHUAN
      </div>
      <div style={{ display: 'flex', fontSize: 80, fontWeight: 700, lineHeight: 1.1 }}>
        {settings.name.slice(0, 70)}
      </div>
      <div
        style={{ display: 'flex', fontSize: 32, lineHeight: 1.5, marginTop: 28, color: '#546777' }}
      >
        {settings.description.slice(0, 180)}
      </div>
    </div>,
    size,
  )
}
