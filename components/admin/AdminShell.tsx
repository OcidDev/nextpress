'use client'

import { useActionState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminNavGroup } from './AdminNavGroup'
import { LogoutButton } from './LogoutButton'
import { MEDIA_UPLOAD_MAX_MB } from '@/lib/media-limits'
import { userHasCapability, type PrimitiveCapability } from '@/lib/core/roles'
import { saveAdminPreferences } from '@/server/actions/admin-preferences'
import type { AdminPreferences } from '@/lib/content/admin-preferences'
import {
  HomeIcon,
  DocumentIcon,
  FolderIcon,
  CommentsIcon,
  ProfileIcon,
  SettingsIcon,
  PlusIcon,
  EyeIcon,
  CircleIcon,
  HamIcon,
  CloseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from '@/components/ui/icons'

const navigation = [
  { label: 'Dasbor', href: '/admin', icon: HomeIcon },
  {
    label: 'Artikel',
    href: '/admin/posts',
    icon: DocumentIcon,
    children: [
      { label: 'Semua artikel', href: '/admin/posts' },
      { label: 'Tambah artikel', href: '/admin/posts/new' },
      { label: 'Kategori', href: '/admin/categories' },
      { label: 'Tag', href: '/admin/tags' },
    ],
  },
  { label: 'Media', href: '/admin/media', icon: FolderIcon },
  {
    label: 'Halaman',
    href: '/admin/pages',
    icon: DocumentIcon,
    children: [
      { label: 'Semua halaman', href: '/admin/pages' },
      { label: 'Tambah halaman', href: '/admin/pages/new' },
    ],
  },
  { label: 'Komentar', href: '/admin/comments', icon: CommentsIcon },
  {
    label: 'Tampilan',
    href: '/admin/appearance',
    icon: EyeIcon,
    children: [
      { label: 'Tema', href: '/admin/appearance' },
      { label: 'Sesuaikan', href: '/admin/appearance/customize' },
    ],
  },
  { label: 'Plugin', href: '/admin/plugins', icon: CircleIcon },
  { label: 'Pengguna', href: '/admin/users', icon: ProfileIcon },
  {
    label: 'Peralatan',
    href: '/admin/tools',
    icon: SettingsIcon,
    children: [
      { label: 'Peralatan Tersedia', href: '/admin/tools' },
      { label: 'Impor', href: '/admin/tools/import' },
      { label: 'Ekspor', href: '/admin/tools/export' },
      { label: 'Kesehatan Situs', href: '/admin/tools/health' },
    ],
  },
  {
    label: 'Pengaturan',
    href: '/admin/settings/general',
    icon: SettingsIcon,
    children: [
      { label: 'Umum', href: '/admin/settings/general' },
      { label: 'Menu', href: '/admin/settings/menus' },
      { label: 'Footer', href: '/admin/settings/footer' },
      { label: 'Tautan sosial', href: '/admin/settings/social' },
      { label: 'Menulis', href: '/admin/settings/writing' },
      { label: 'Membaca', href: '/admin/settings/reading' },
      { label: 'Permalink', href: '/admin/settings/permalinks' },
      { label: 'Diskusi', href: '/admin/settings/discussion' },
      { label: 'Integrasi', href: '/admin/settings/integrations' },
    ],
  },
]

export function AdminShell({
  children,
  name,
  siteName,
  pendingComments,
  preferences,
  version,
  role,
  roleLabel,
  capabilities,
  image,
}: {
  children: React.ReactNode
  name: string
  siteName: string
  pendingComments: number
  preferences: AdminPreferences
  version: string
  role: string
  roleLabel: string
  capabilities: PrimitiveCapability[]
  image?: string | null
}) {
  const can = (cap: PrimitiveCapability) => userHasCapability({ role, capabilities }, cap)
  const routeCaps: Record<string, PrimitiveCapability> = {
    '/admin': 'read',
    '/admin/posts': 'edit_posts',
    '/admin/media': 'upload_files',
    '/admin/pages': 'edit_others_pages',
    '/admin/comments': 'moderate_comments',
    '/admin/appearance': 'edit_theme_options',
    '/admin/plugins': 'activate_plugins',
    '/admin/users': 'list_users',
    '/admin/settings': 'manage_options',
    '/admin/categories': 'manage_categories',
    '/admin/tags': 'manage_categories',
  }
  const permitted = (href: string) =>
    can(
      routeCaps[href] ??
        (href.startsWith('/admin/appearance/')
          ? 'edit_theme_options'
          : href.startsWith('/admin/posts/')
            ? 'edit_posts'
            : href.startsWith('/admin/pages/')
              ? 'edit_others_pages'
              : 'manage_options'),
    )
  const allowedNavigation = navigation
    .filter((item) => permitted(item.href))
    .map((item) => ({ ...item, children: item.children?.filter((child) => permitted(child.href)) }))
  const pathname = usePathname()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [state, action, pending] = useActionState(saveAdminPreferences, {})
  useEffect(() => {
    dialog.current?.close()
  }, [pathname])
  function active(href: string) {
    return href === '/admin'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
  }
  function menu(mobile = false) {
    return (
      <nav aria-label={mobile ? 'Menu admin mobile' : 'Menu admin'} className="adminNavigation">
        {allowedNavigation.map((item) => {
          const current =
            active(item.href) ||
            item.children?.some((child) => active(child.href)) ||
            (item.label === 'Artikel' && ['/admin/categories', '/admin/tags'].includes(pathname))
          return (
            <AdminNavGroup
              key={item.href}
              item={item}
              icon={<item.icon />}
              current={Boolean(current)}
              pathname={pathname}
              mobile={mobile}
              collapsed={preferences.collapsed}
              badge={item.label === 'Komentar' ? pendingComments : undefined}
            />
          )
        })}
      </nav>
    )
  }
  return (
    <div className={`adminWorkspace${preferences.collapsed ? ' sidebarCollapsed' : ''}`}>
      <a href="#admin-content" className="skipLink">
        Langsung ke konten admin
      </a>
      <header className="adminToolbar">
        <button
          ref={trigger}
          className="adminMobileTrigger"
          aria-label="Buka menu admin"
          onClick={() => dialog.current?.showModal()}
        >
          <HamIcon />
        </button>
        <Link className="adminBrand" href="/admin">
          <span className="adminBrandMark" aria-hidden="true">
            n
          </span>
          <span>NextPress</span>
        </Link>
        <Link href="/" className="adminSiteLink">
          <EyeIcon />
          <span>{siteName}</span>
        </Link>
        {can('edit_posts') && (
          <details className="toolbarDropdown">
            <summary>
              <PlusIcon />
              <span>Baru</span>
            </summary>
            <div className="toolbarPopover">
              <Link href="/admin/posts/new">Artikel baru</Link>
              {can('edit_others_pages') && <Link href="/admin/pages/new">Halaman baru</Link>}
              {can('upload_files') && <Link href="/admin/media">Unggah media</Link>}
            </div>
          </details>
        )}
        {can('moderate_comments') && (
          <Link
            href="/admin/comments"
            className="toolbarComments"
            aria-label={`${pendingComments} komentar menunggu`}
          >
            <CommentsIcon />
            <span>{pendingComments}</span>
          </Link>
        )}
        <details className="toolbarDropdown adminAccount">
          <summary aria-label="Menu akun">
            <span className="adminAccountName">{name}</span>
            <span className="adminAvatar" aria-hidden="true">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="adminAvatarImg" />
              ) : (
                name.slice(0, 1).toUpperCase()
              )}
            </span>
          </summary>
          <div className="toolbarPopover">
            <strong>{name}</strong>
            <span>{roleLabel}</span>
            <Link href="/admin/profile">Profil Saya</Link>
            <LogoutButton />
          </div>
        </details>
      </header>
      <aside className="adminSidebar">
        {menu()}
        <form action={action} className="adminCollapseForm">
          <input
            type="hidden"
            name="preferences"
            value={JSON.stringify({ collapsed: !preferences.collapsed })}
          />
          <button
            disabled={pending}
            aria-label={preferences.collapsed ? 'Perluas menu' : 'Ciutkan menu'}
          >
            {preferences.collapsed ? <ArrowRightIcon /> : <ArrowLeftIcon />}
            <span className="adminNavLabel">Ciutkan menu</span>
          </button>
          {state.error && <p role="alert">{state.error}</p>}
        </form>
      </aside>
      <dialog
        ref={dialog}
        className="adminMobileDrawer"
        aria-label="Navigasi admin"
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) dialog.current?.close()
        }}
      >
        <div className="adminDrawerHeader">
          <strong>NextPress</strong>
          <button aria-label="Tutup menu admin" onClick={() => dialog.current?.close()}>
            <CloseIcon />
          </button>
        </div>
        {menu(true)}
      </dialog>
      <div className="adminWorkArea">
        <main id="admin-content" tabIndex={-1} className="adminMain">
          {pathname !== '/admin' && (
            <details className="adminContextHelp">
              <summary>Bantuan</summary>
              <p>
                {pathname.startsWith('/admin/posts')
                  ? 'Penulis otomatis mengikuti akun Anda. Simpan draft untuk melihat preview sebelum menerbitkan artikel.'
                  : pathname.startsWith('/admin/media')
                    ? `Unggah gambar maksimal ${MEDIA_UPLOAD_MAX_MB} MB, kelola alt text, lalu pilih gambar dari editor. Media yang masih digunakan tidak dapat dihapus.`
                    : pathname.startsWith('/admin/comments')
                      ? 'Komentar baru menunggu persetujuan. Ubah status untuk menyetujui atau menandai spam.'
                      : pathname.startsWith('/admin/pages')
                        ? 'Simpan halaman sebagai draft untuk preview privat, lalu terbitkan. Tambahkan tautan halaman terbit melalui Pengaturan → Menu.'
                        : pathname.startsWith('/admin/profile')
                          ? 'Atur nama, foto profil, dan kredensial akun Anda.'
                          : pathname.startsWith('/admin/users')
                            ? 'Kelola akun, peran, dan status pengguna. Menonaktifkan akun mencabut sesinya.'
                            : 'Atur identitas, tampilan, dan integrasi situs melalui formulir. Perubahan tampilan dapat dipreview sebelum diterapkan.'}
              </p>
            </details>
          )}
          {children}
        </main>
        <footer className="adminFooter">
          <span>Dibuat untuk cerita dan gagasan Anda.</span>
          <span>
            NextPress <small>v{version}</small>
          </span>
        </footer>
      </div>
    </div>
  )
}
