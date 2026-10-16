'use client'
// client — optional analytics and ads only load after consent.
import { useEffect, useState } from 'react'
import Script from 'next/script'
import { GoogleAnalytics } from '@next/third-parties/google'
export function IntegrationConsent({ gaId, adsenseId }: { gaId: string; adsenseId: string }) {
  const [choice, setChoice] = useState<string | null>(null)
  const [manage, setManage] = useState(false)
  useEffect(() => {
    try {
      setChoice(localStorage.getItem('blog-integrations'))
    } catch {}
  }, [])
  if (!gaId && !adsenseId) return null
  function choose(value: string) {
    try {
      localStorage.setItem('blog-integrations', value)
    } catch {}
    const wasAllowed = choice === 'allow'
    setChoice(value)
    setManage(false)
    if (wasAllowed && value !== 'allow') window.location.reload()
  }
  return (
    <>
      {choice === 'allow' && (
        <>
          {gaId && <GoogleAnalytics gaId={gaId} />}{' '}
          {adsenseId && (
            <Script
              id="cms-adsense"
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
              crossOrigin="anonymous"
              strategy="afterInteractive"
            />
          )}
        </>
      )}
      {!choice || manage ? (
        <aside
          className="panel"
          aria-label="Pilihan privasi"
          style={{
            position: 'fixed',
            insetInlineEnd: 16,
            bottom: 80,
            width: 'calc(100% - 32px)',
            maxWidth: 360,
            zIndex: 40,
          }}
        >
          <p>Izinkan analitik dan iklan untuk situs ini?</p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => choose('allow')}>Izinkan</button>
            <button onClick={() => choose('deny')}>Tolak</button>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          className="textButton"
          style={{ marginInline: 24 }}
          onClick={() => setManage(true)}
        >
          Pengaturan privasi
        </button>
      )}
    </>
  )
}
