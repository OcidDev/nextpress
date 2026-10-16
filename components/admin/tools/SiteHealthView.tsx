'use client'

import type { SiteHealthReport } from '@/lib/core/tools'

export function SiteHealthView({ report }: { report: SiteHealthReport }) {
  const statusColors = {
    good: { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', label: 'Bagus' },
    recommended: { bg: '#fffbeb', text: '#92400e', border: '#fde68a', label: 'Disarankan' },
    should_improve: {
      bg: '#fffbeb',
      text: '#92400e',
      border: '#fde68a',
      label: 'Perlu Peningkatan',
    },
    critical: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', label: 'Kritis' },
  }

  const overall = statusColors[report.overallStatus] || statusColors.good

  return (
    <div className="adminSettingsStack">
      <div
        className="adminSettingsSection"
        style={{
          borderLeft: `6px solid ${overall.border}`,
          padding: '1.25rem',
          backgroundColor: overall.bg,
          borderRadius: '4px',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: 0, color: overall.text, fontSize: '1.25rem' }}>
          Status Kesehatan Situs: {overall.label}
        </h2>
        <p style={{ margin: '0.5rem 0 0', color: overall.text }}>
          {report.overallStatus === 'good'
            ? 'Pemeriksaan yang tersedia tidak menemukan masalah. Rincian hasil ada di bawah.'
            : 'Ada konfigurasi yang perlu ditindaklanjuti. Periksa rincian di bawah untuk mengetahui masalahnya.'}
        </p>
      </div>

      <div className="adminSettingsSection">
        <h3>Hasil Pemeriksaan Sistem</h3>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}
        >
          {report.checks.map((check) => {
            const conf = statusColors[check.status] || statusColors.good
            return (
              <div key={check.test} className="adminHealthCheck">
                <div>
                  <strong style={{ display: 'block', fontSize: '0.95rem' }}>{check.label}</strong>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{check.description}</span>
                </div>
                <span
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    backgroundColor: conf.bg,
                    color: conf.text,
                    border: `1px solid ${conf.border}`,
                  }}
                >
                  {conf.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="adminSettingsSection" style={{ marginTop: '2rem' }}>
        <h3>Informasi Lingkungan & Perangkat Lunak</h3>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '1rem',
            fontSize: '0.9rem',
          }}
        >
          <tbody>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>Runtime Node.js</td>
              <td style={{ padding: '0.5rem 0' }}>{report.systemInfo.nodeVersion}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>Basis Data</td>
              <td style={{ padding: '0.5rem 0' }}>{report.systemInfo.database}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>Lingkungan (Environment)</td>
              <td style={{ padding: '0.5rem 0' }}>{report.systemInfo.environment}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>Tema Aktif</td>
              <td style={{ padding: '0.5rem 0' }}>{report.systemInfo.activeTheme}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>Plugin Aktif</td>
              <td style={{ padding: '0.5rem 0' }}>{report.systemInfo.activePluginsCount} plugin</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
