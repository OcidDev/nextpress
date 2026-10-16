'use client'

import { useActionState, useState } from 'react'
import { importWxrAction, importBloggerAction } from '@/server/actions/tools'

export function ImportView() {
  const [wpState, wpAction, wpPending] = useActionState(importWxrAction, {})
  const [bloggerState, bloggerAction, bloggerPending] = useActionState(importBloggerAction, {})
  const [wpDryRun, setWpDryRun] = useState(false)
  const [bloggerDryRun, setBloggerDryRun] = useState(false)

  return (
    <div className="adminSettingsStack">
      <div className="adminSettingsSection">
        <h2>WordPress Importer</h2>
        <p>
          Impor pos, laman, komentar, bidang kustom, kategori, dan tag dari berkas ekspor WordPress (WXR / XML).
        </p>
        <form action={wpAction} className="adminForm">
          <label>
            Pilih berkas WXR (.xml)
            <input
              type="file"
              name="file"
              accept=".xml,text/xml"
              required
              disabled={wpPending}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="dryRun"
              value="true"
              checked={wpDryRun}
              onChange={(e) => setWpDryRun(e.target.checked)}
              disabled={wpPending}
            />
            Simulasi saja (Dry run - jangan simpan ke basis data)
          </label>
          {wpState.error && <p role="alert" style={{ color: '#ef4444', fontWeight: 500 }}>{wpState.error}</p>}
          {wpState.message && <p role="status" style={{ color: '#10b981', fontWeight: 500 }}>{wpState.message}</p>}
          <button type="submit" className="button" disabled={wpPending}>
            {wpPending ? 'Memproses Berkas WXR…' : 'Jalankan Pengimpor WordPress'}
          </button>
        </form>
      </div>

      <div className="adminSettingsSection" style={{ marginTop: '2rem' }}>
        <h2>Blogger Importer</h2>
        <p>
          Impor artikel, laman statis, dan label dari berkas cadangan Google Blogger (Atom XML / blog-MM-DD-YYYY.xml).
        </p>
        <form action={bloggerAction} className="adminForm">
          <label>
            Pilih berkas cadangan Blogger (.xml)
            <input
              type="file"
              name="file"
              accept=".xml,text/xml"
              required
              disabled={bloggerPending}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="dryRun"
              value="true"
              checked={bloggerDryRun}
              onChange={(e) => setBloggerDryRun(e.target.checked)}
              disabled={bloggerPending}
            />
            Simulasi saja (Dry run - jangan simpan ke basis data)
          </label>
          {bloggerState.error && <p role="alert" style={{ color: '#ef4444', fontWeight: 500 }}>{bloggerState.error}</p>}
          {bloggerState.message && <p role="status" style={{ color: '#10b981', fontWeight: 500 }}>{bloggerState.message}</p>}
          <button type="submit" className="button" disabled={bloggerPending}>
            {bloggerPending ? 'Memproses Berkas Blogger…' : 'Jalankan Pengimpor Blogger'}
          </button>
        </form>
      </div>
    </div>
  )
}
