'use client'

import Link from 'next/link'
import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { ModerateForm } from './ModerateForm'
import {
  ArowDownIcon,
  ArowUpIcon,
  CloseIcon,
  CommentsIcon,
  DocumentIcon,
  EditIcon,
  EyeIcon,
  FolderIcon,
  PlusIcon,
  SettingsIcon,
  StatsIcon,
} from '@/components/ui/icons'
import {
  dashboardPanelIds,
  type AdminPreferences,
  type DashboardPanelId,
} from '@/lib/content/admin-preferences'
import type { DashboardData } from '@/lib/db/queries/dashboard'
import type { ActionState } from '@/lib/content/validation'
import { formatDate } from '@/lib/utils'
import { saveAdminPreferences } from '@/server/actions/admin-preferences'

const panelTitles: Record<DashboardPanelId, string> = {
  welcome: 'Selamat datang',
  overview: 'Sekilas situs',
  activity: 'Aktivitas terbaru',
  drafts: 'Draft terakhir',
  moderation: 'Komentar menunggu',
  setup: 'Langkah awal',
}

export function Dashboard({
  data,
  preferences,
  siteName,
  role,
  canUpload = true,
}: {
  data: DashboardData
  preferences: AdminPreferences
  siteName: string
  role: string
  canUpload?: boolean
}) {
  const isAdmin = ['admin', 'administrator'].includes(role)
  const allowedPanelIds = dashboardPanelIds.filter(
    (id) => isAdmin || !['moderation', 'setup'].includes(id),
  )
  const [panels, setPanels] = useState(preferences.panels)
  const optionsSummary = useRef<HTMLElement>(null)
  const focusOptionsAfterSave = useRef(false)
  const preferenceKey = preferences.panels.join(',')

  useEffect(() => {
    setPanels(preferenceKey ? (preferenceKey.split(',') as DashboardPanelId[]) : [])
  }, [preferenceKey])

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await saveAdminPreferences(previous, formData)
      if (!result.error) {
        const saved = JSON.parse(String(formData.get('preferences'))) as {
          panels: DashboardPanelId[]
        }
        setPanels(saved.panels)
        if (focusOptionsAfterSave.current) optionsSummary.current?.focus()
      }
      focusOptionsAfterSave.current = false
      return result
    },
    {},
  )

  function savePanels(next: DashboardPanelId[], focusOptions = false) {
    const formData = new FormData()
    formData.set('preferences', JSON.stringify({ panels: next }))
    focusOptionsAfterSave.current = focusOptions
    startTransition(() => action(formData))
  }

  function movePanel(id: DashboardPanelId, direction: -1 | 1) {
    const visible = panels.filter((panel) => allowedPanelIds.includes(panel))
    const target = visible[visible.indexOf(id) + direction]
    if (!target) return
    const index = panels.indexOf(id)
    const targetIndex = panels.indexOf(target)
    const next = [...panels]
    ;[next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!]
    savePanels(next)
  }

  const stats = [
    {
      value: data.stats.published,
      label: 'Artikel terbit',
      href: '/admin/posts',
      icon: DocumentIcon,
    },
    { value: data.stats.drafts, label: 'Draft artikel', href: '/admin/posts', icon: EditIcon },
    { value: data.stats.pages, label: 'Halaman', href: '/admin/pages', icon: DocumentIcon },
    { value: data.stats.media, label: 'Gambar di media', href: '/admin/media', icon: FolderIcon },
    {
      value: data.stats.pending,
      label: 'Komentar menunggu',
      href: '/admin/comments',
      icon: CommentsIcon,
    },
  ].filter(
    (item) =>
      (isAdmin || ['/admin/posts', '/admin/media'].includes(item.href)) &&
      (canUpload || item.href !== '/admin/media'),
  )
  const visiblePanels = panels.filter((id) => allowedPanelIds.includes(id))
  const setup = [
    {
      complete: data.setup.hasAuthor,
      title: 'Lengkapi profil penulis',
      description: 'Nama dan profil yang tampil bersama artikel.',
      href: '/admin/profile',
    },
    {
      complete: data.setup.hasSiteIdentity,
      title: 'Lengkapi identitas situs',
      description: 'Atur nama, slogan, dan logo situs.',
      href: '/admin/settings/general',
    },
    {
      complete: data.setup.hasPost,
      title: 'Tulis artikel pertama',
      description: 'Mulai dari draft, lalu terbitkan saat siap.',
      href: '/admin/posts/new',
    },
  ]

  function panelContent(id: DashboardPanelId) {
    switch (id) {
      case 'welcome':
        return (
          <div className="dashboardWelcomeBody">
            <div>
              <p className="adminEyebrow">RUANG KERJA ANDA</p>
              <h2>Selamat datang di {siteName}</h2>
              <p>Tulisan, tampilan, dan percakapan situs Anda, semuanya dimulai di sini.</p>
              <div className="dashboardWelcomeActions">
                <Link className="button" href="/admin/posts/new">
                  <PlusIcon aria-hidden="true" /> Tulis artikel
                </Link>
                {isAdmin && (
                  <Link className="button secondary" href="/admin/settings/general">
                    <SettingsIcon aria-hidden="true" /> Pengaturan situs
                  </Link>
                )}
                <Link className="dashboardTextLink" href="/">
                  <EyeIcon aria-hidden="true" /> Lihat situs
                </Link>
              </div>
            </div>
            <div className="dashboardWelcomeGraphic" aria-hidden="true">
              <DocumentIcon />
              <span>
                <StatsIcon />
              </span>
            </div>
          </div>
        )
      case 'overview':
        return (
          <>
            <div className="dashboardStats">
              {stats.map(({ value, label, href, icon: Icon }) => (
                <Link key={label} href={href}>
                  <Icon aria-hidden="true" />
                  <strong>{value}</strong>
                  <span className="dashboardStatLabel">{label}</span>
                </Link>
              ))}
            </div>
            <p className="dashboardMeta">
              {isAdmin
                ? `${data.stats.all} artikel dan ${data.stats.authors} profil penulis dikelola di situs ini.`
                : `${data.stats.all} artikel milik Anda.`}
            </p>
          </>
        )
      case 'activity':
        return data.activity.length ? (
          <ul className="dashboardList dashboardActivity">
            {data.activity.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <span className={`dashboardActivityIcon ${item.kind}`} aria-hidden="true">
                  {item.kind === 'post' ? <DocumentIcon /> : <CommentsIcon />}
                </span>
                <div>
                  <Link href={item.href}>{item.title}</Link>
                  <p>{item.description}</p>
                  <time className="dashboardMeta" dateTime={item.date}>
                    {formatDate(item.date)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dashboardEmpty">
            <StatsIcon aria-hidden="true" />
            <h3>Aktivitas akan muncul di sini</h3>
            <p>
              Artikel yang diperbarui dan komentar baru akan tercatat setelah Anda mulai mengisi
              situs.
            </p>
            <Link href="/admin/posts/new">Mulai menulis</Link>
          </div>
        )
      case 'drafts':
        return (
          <>
            {data.drafts.length ? (
              <ul className="dashboardList">
                {data.drafts.map((draft) => (
                  <li key={draft.id}>
                    <div>
                      <Link href={`/admin/posts/${draft.id}`}>
                        {draft.title || 'Artikel tanpa judul'}
                      </Link>
                      <p className="dashboardMeta">
                        Terakhir diedit{' '}
                        <time dateTime={draft.updatedAt}>{formatDate(draft.updatedAt)}</time>
                      </p>
                    </div>
                    <span className="dashboardStatus">Draft</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dashboardEmpty">
                <EditIcon aria-hidden="true" />
                <h3>Ruang untuk ide berikutnya</h3>
                <p>Simpan artikel sebagai draft untuk melanjutkan menulis kapan saja.</p>
              </div>
            )}
            <Link className="dashboardPanelLink" href="/admin/posts/new">
              Tulis artikel baru <PlusIcon aria-hidden="true" />
            </Link>
          </>
        )
      case 'moderation':
        return (
          <>
            {data.pendingComments.length ? (
              <ul className="dashboardList dashboardModeration">
                {data.pendingComments.map((comment) => (
                  <li key={comment.id}>
                    <div>
                      <strong>{comment.authorName}</strong>
                      <p className="dashboardMeta">Pada artikel {comment.title}</p>
                      <p className="moderationPreview">{comment.content}</p>
                      <ModerateForm id={comment.id} status={comment.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dashboardEmpty">
                <CommentsIcon aria-hidden="true" />
                <h3>Antrean komentar kosong</h3>
                <p>Komentar pembaca yang menunggu persetujuan akan tampil di panel ini.</p>
              </div>
            )}
            <Link className="dashboardPanelLink" href="/admin/comments">
              Kelola semua komentar <CommentsIcon aria-hidden="true" />
            </Link>
          </>
        )
      case 'setup':
        return (
          <ol className="setupList">
            {setup.map((step, index) => (
              <li className={step.complete ? 'setupComplete' : undefined} key={step.title}>
                <span className="setupMarker" aria-hidden="true">
                  {step.complete ? '✓' : index + 1}
                </span>
                <div>
                  <Link href={step.href}>{step.title}</Link>
                  <p>{step.description}</p>
                  {step.complete && <span className="dashboardMeta">Sudah tersedia</span>}
                </div>
              </li>
            ))}
          </ol>
        )
    }
  }

  return (
    <>
      <div className="adminPageHeader">
        <div>
          <p className="adminEyebrow">KELOLA SITUS</p>
          <h1>Dasbor</h1>
          <p className="adminPageIntro">Lihat perkembangan situs dan lanjutkan pekerjaan Anda.</p>
        </div>
        <div className="dashboardPageTools">
          <details className="dashboardOptions">
            <summary ref={optionsSummary}>Opsi layar</summary>
            <div className="dashboardDisclosureBody">
              <strong>Panel dashboard</strong>
              <p>Pilih panel yang ingin ditampilkan. Pilihan disimpan untuk akun Anda.</p>
              {allowedPanelIds.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={panels.includes(id)}
                    disabled={pending}
                    onChange={(event) =>
                      savePanels(
                        event.target.checked
                          ? [...panels, id]
                          : panels.filter((panel) => panel !== id),
                      )
                    }
                  />
                  {panelTitles[id]}
                </label>
              ))}
            </div>
          </details>
          <details className="dashboardHelp">
            <summary>Bantuan</summary>
            <div className="dashboardDisclosureBody">
              <strong>Mulai dari dashboard</strong>
              <p>
                Penulis otomatis mengikuti akun Anda. Buat artikel dan simpan sebagai draft sebelum
                menerbitkan.
              </p>
              {isAdmin && (
                <p>
                  Ubah identitas, menu, dan warna situs melalui Tampilan. Komentar baru perlu
                  disetujui sebelum muncul di situs.
                </p>
              )}
              <p>
                Gunakan panah di judul panel untuk mengurutkan ruang kerja. Panel yang ditutup dapat
                ditampilkan kembali melalui Opsi layar.
              </p>
            </div>
          </details>
        </div>
      </div>
      <div className="dashboardPreferenceStatus" aria-live="polite">
        {pending && <p role="status">Menyimpan susunan dashboard…</p>}
        {state.error && <p role="alert">{state.error}</p>}
        {!pending && state.success && <p role="status">{state.success}</p>}
      </div>
      {visiblePanels.length ? (
        <div className="dashboardGrid">
          {visiblePanels.map((id, index) => (
            <section
              className={`dashboardPanel${id === 'welcome' ? ' adminWelcome' : ''}`}
              key={id}
              aria-label={panelTitles[id]}
            >
              <div className="panelHeading">
                {id === 'welcome' ? <span>{panelTitles[id]}</span> : <h2>{panelTitles[id]}</h2>}
                <div className="dashboardPanelActions">
                  <button
                    type="button"
                    disabled={pending || index === 0}
                    onClick={() => movePanel(id, -1)}
                    aria-label={`Pindahkan panel ${panelTitles[id]} ke atas`}
                    title="Pindah ke atas"
                  >
                    <ArowUpIcon aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === visiblePanels.length - 1}
                    onClick={() => movePanel(id, 1)}
                    aria-label={`Pindahkan panel ${panelTitles[id]} ke bawah`}
                    title="Pindah ke bawah"
                  >
                    <ArowDownIcon aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      savePanels(
                        panels.filter((panel) => panel !== id),
                        true,
                      )
                    }
                    aria-label={`Tutup panel ${panelTitles[id]}`}
                    title="Tutup panel"
                  >
                    <CloseIcon aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="dashboardPanelBody">{panelContent(id)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="dashboardPanel dashboardEmpty">
          <StatsIcon aria-hidden="true" />
          <h2>Dashboard sesuai kebutuhan Anda</h2>
          <p>
            Semua panel disembunyikan. Tampilkan kembali lewat Opsi layar atau pulihkan susunan
            awal.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => savePanels([...dashboardPanelIds])}
          >
            Tampilkan semua panel
          </button>
        </div>
      )}
    </>
  )
}
