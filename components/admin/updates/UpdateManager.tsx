'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { UpdatePageData } from '@/lib/updates/actions-data'
import {
  checkUpdatesAction,
  refreshUpdateJobAction,
  startUpdateAction,
} from '@/server/actions/updates'
import styles from './UpdateManager.module.css'

const pollInterval = 10_000

const statusLabels: Record<string, string> = {
  queued: 'Menunggu provider',
  deploying: 'Deployment berjalan',
  ready: 'Selesai',
  failed: 'Gagal',
}

function formatTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function UpdateManager({ data }: { data: UpdatePageData }) {
  const router = useRouter()
  const [job, setJob] = useState(data.job)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [checking, startChecking] = useTransition()
  const [starting, startStarting] = useTransition()

  const active = job?.status === 'queued' || job?.status === 'deploying'
  const latest = data.check?.status === 'available' ? data.check.latest : null
  // The button reflects every server-side rule that startUpdateJob enforces, so
  // the operator sees why it is disabled before the request is rejected.
  const blocked = !data.adapter.ready
    ? `Pembaruan belum dikonfigurasi: ${data.adapter.missing.join(', ')} belum diisi.`
    : null
  const incompatible =
    data.check?.status === 'available' && !data.check.compatible
      ? (data.check.incompatibleReason ?? 'Rilis ini tidak kompatibel dengan instalasi.')
      : null
  const reason = blocked ?? incompatible ?? (active ? 'Pembaruan sedang berjalan.' : null)

  useEffect(() => {
    if (!active) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    async function tick() {
      const result = await refreshUpdateJobAction()
      if (stopped) return
      if (result.job) setJob(result.job)
      if (result.error) setNotice({ tone: 'error', text: result.error })
      if (result.job?.status === 'ready') {
        setNotice({ tone: 'ok', text: `Situs kini menjalankan versi ${result.job.toVersion}.` })
        router.refresh()
        return
      }
      if (result.job?.status === 'failed') {
        setNotice({ tone: 'error', text: result.job.detail ?? 'Deployment gagal.' })
        router.refresh()
        return
      }
      timer = setTimeout(tick, pollInterval)
    }
    timer = setTimeout(tick, pollInterval)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
    // `active` flips only when a job enters or leaves a running state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  function check() {
    setNotice(null)
    startChecking(async () => {
      const result = await checkUpdatesAction()
      if (result.error) setNotice({ tone: 'error', text: result.error })
      else setNotice({ tone: 'ok', text: result.message ?? 'Pemeriksaan selesai.' })
      router.refresh()
    })
  }

  function apply() {
    if (!latest) return
    setConfirming(false)
    setNotice(null)
    startStarting(async () => {
      const result = await startUpdateAction(latest.tag)
      if (result.job) setJob(result.job)
      if (result.error) setNotice({ tone: 'error', text: result.error })
      else setNotice({ tone: 'ok', text: result.message ?? 'Deployment dimulai.' })
      router.refresh()
    })
  }

  return (
    <>
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className="adminNotice"
          data-tone={notice.tone}
        >
          {notice.text}
        </p>
      )}

      <div className={styles.versions}>
        <div className={styles.version}>
          <small>Terpasang</small>
          <strong>{data.installed}</strong>
        </div>
        <div className={styles.version}>
          <small>Stabil terbaru</small>
          <strong>{latest ? latest.version : data.cached?.version || data.installed}</strong>
        </div>
        <div className={styles.version}>
          <small>Terakhir diperiksa</small>
          <strong>{formatTime(data.cached?.checkedAt ?? data.check?.checkedAt ?? null)}</strong>
        </div>
      </div>

      {data.error && (
        <p className="adminNotice" data-tone="warning">
          Pemeriksaan otomatis gagal: {data.error}
          {data.cached && ' Menampilkan hasil pemeriksaan terakhir yang berhasil.'}
        </p>
      )}

      {!latest && !data.error && (
        <p>Instalasi sudah memakai versi stabil terbaru yang diterbitkan.</p>
      )}

      {latest && (
        <>
          <h2>Catatan rilis {latest.tag}</h2>
          <p className="adminPageIntro">
            Diterbitkan {formatTime(latest.releasedAt)} · commit {latest.commit.slice(0, 10)}
            {latest.migrations.count > 0 &&
              ` · ${latest.migrations.count} migrasi hingga ${latest.migrations.upto}`}
            {!latest.rollbackSafe && ' · perubahan skema tidak dapat di-rollback'}
          </p>
          <div className={styles.notes}>{latest.notes.trim() || 'Tidak ada catatan rilis.'}</div>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className="button secondary" onClick={check} disabled={checking}>
          {checking ? 'Memeriksa…' : 'Cek pembaruan'}
        </button>
        {latest &&
          (confirming ? (
            <>
              <button type="button" className="button" onClick={apply} disabled={starting || Boolean(reason)}>
                {starting ? 'Memulai…' : `Ya, pasang ${latest.version}`}
              </button>
              <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
                Batal
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => setConfirming(true)}
              disabled={starting || Boolean(reason)}
            >
              Perbarui NextPress
            </button>
          ))}
      </div>

      {reason && <p className={styles.reason}>{reason}</p>}

      {!data.adapter.ready && (
        <>
          <h2>Penyiapan metode pemasangan</h2>
          <p className="adminPageIntro">
            Adapter <strong>{data.adapter.label}</strong> meminta provider membangun ulang rilis
            dari tag yang terverifikasi. Isi variabel berikut pada server (bukan di klien), lalu
            mulai ulang proses aplikasi:
          </p>
          <ul className={styles.steps}>
            {data.adapter.missing.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
          <p className="adminPageIntro">
            Token dibuat di dasbor provider dan hanya perlu izin deployment untuk proyek ini.
            Jangan menaruh token di pengaturan situs atau variabel yang diawali{' '}
            <code>NEXT_PUBLIC_</code>.
          </p>
        </>
      )}

      {job && (
        <section className={styles.job} aria-live="polite">
          <h2>Pekerjaan pembaruan</h2>
          <p>
            <span className={styles.badge} data-status={job.status}>
              {statusLabels[job.status] ?? job.status}
            </span>
            {job.stale && ' · provider belum menjawab lebih dari satu jam'}
          </p>
          <dl>
            <dt>Versi</dt>
            <dd>
              {job.fromVersion} → {job.toVersion} ({job.tag})
            </dd>
            <dt>Adapter</dt>
            <dd>{job.adapter}</dd>
            <dt>Dimulai</dt>
            <dd>{formatTime(job.createdAt)}</dd>
            {job.finishedAt && (
              <>
                <dt>Selesai</dt>
                <dd>{formatTime(job.finishedAt)}</dd>
              </>
            )}
            {job.detail && (
              <>
                <dt>Keterangan</dt>
                <dd>{job.detail}</dd>
              </>
            )}
            {job.externalUrl && (
              <>
                <dt>Deployment</dt>
                <dd>
                  <a href={job.externalUrl} target="_blank" rel="noreferrer">
                    Buka di dasbor provider
                  </a>
                </dd>
              </>
            )}
          </dl>
        </section>
      )}
    </>
  )
}
