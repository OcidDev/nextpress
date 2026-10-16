import { z } from 'zod'
import type { Widget } from '@/lib/content/appearance'
import type { PostSummary } from '@/types'

/**
 * Peta tipe hook ekstensi (sprint EXT-01).
 *
 * Berkas ini memuat dua hal:
 *
 * 1. **Tipe nilai per hook** (`FilterValues`, `ActionValues`) — kontrak TypeScript
 *    yang dipakai titik panggil di aplikasi. Tipe nilainya adalah tipe asli
 *    aplikasi (`PostSummary`, `Widget`), bukan salinan bentuknya, supaya
 *    perubahan tipe di tempat lain ikut terlihat di sini alih-alih diam-diam
 *    menyimpang.
 * 2. **Skema Zod per hook** — validasi saat jalan. `applyFilters` memeriksa nilai
 *    yang dikembalikan setiap callback; nilai yang tidak sesuai dibuang dan
 *    dicatat, lalu callback berikutnya tetap berjalan dari nilai sah terakhir.
 *    `doAction` memeriksa payload sebelum callback dijalankan.
 *
 * Skema objek sengaja **longgar** (`z.looseObject`): yang diperiksa hanya bentuk
 * kasar yang menandakan kesalahan nyata — bukan objek, atau kehilangan kunci
 * identitas (`id`/`slug`/`title`). Bentuk lengkapnya sudah dijaga TypeScript, dan
 * menduplikasinya di sini akan cepat basi.
 */

/** Satu entri menu admin yang dapat disisipkan ekstensi (hook `admin_menu`). */
export type AdminMenuItem = {
  id: string
  label: string
  href: string
  /** Kapabilitas yang dibutuhkan; kosong berarti semua pengguna CMS. */
  capability?: string
}

/** Nilai yang dilewatkan filter, per nama hook. */
export type FilterValues = {
  /** HTML artikel, tepat sebelum sanitasi dan render (`components/post/PostContent.tsx`). */
  the_content: string
  /** Judul artikel seperti yang tampil di halaman (`components/post/ArticleContent.tsx`, `app/(site)/[slug]/page.tsx`). */
  the_title: string
  /** Judul dokumen `<title>` sebelum dipakai Next (`lib/content/metadata.ts`). */
  document_title: string
  /** Kelas `<body>` (`app/layout.tsx`). */
  body_class: string
  /**
   * HTML mentah untuk `<head>`. **Belum ada titik panggil** — lihat
   * `deferredHooks` di bawah: HTML mentah di dalam `<head>` butuh keputusan
   * sanitasi sendiri sebelum boleh dibuka.
   */
  head_tags: string[]
  /** Data satu kartu artikel (`components/blog/PostList.tsx`). */
  post_card: PostSummary
  /** Widget aktif pada satu area (`components/theme/Widgets.tsx`). */
  widget_areas: Widget[]
  /**
   * Entri menu admin. **Belum ada titik panggil** — lihat `deferredHooks`:
   * menu hari ini tinggal di komponen klien `components/admin/AdminShell.tsx`,
   * sehingga harus dipindahkan ke sisi server lebih dulu.
   */
  admin_menu: AdminMenuItem[]
}

/** Payload yang dilewatkan action, per nama hook. */
export type ActionValues = {
  /** Committed option mutation; values are omitted to keep private settings private. */
  option_changed: { name: string; operation: 'add' | 'update' | 'delete' }
  /** Setiap penyimpanan artikel dari CMS. */
  post_saved: { id: string; slug: string; status: 'draft' | 'pending' | 'published' }
  /** Hanya saat status akhir penyimpanan adalah `published`. */
  post_published: { id: string; slug: string }
  /** Moderasi komentar yang berakhir `approved`. */
  comment_approved: { id: string; postId: string }
  /** Plugin dinyalakan dari CMS (pemasangan sendiri selalu berakhir nonaktif). */
  plugin_activated: { id: string; version: string }
  // Tahap siklus hidup kernel (EXT-02), meniru urutan `wp-settings.php`. Ekstensi
  // mendengarkannya lewat `registry.addAction`, bukan dipanggil langsung.
  /** Setelah seluruh ekstensi bawaan (padanan `mu-plugins`) dimuat. */
  extensions_loaded: { builtin: string[] }
  /** Setelah seluruh plugin aktif dimuat. */
  plugins_loaded: { plugins: string[] }
  /** Setelah tema aktif dimuat; `null` selama belum ada sistem tema. */
  after_setup_theme: { theme: string | null }
  /** Tahap terakhir boot, sebelum render dimulai. */
  init: { booted: string[] }
}

export type FilterHookName = keyof FilterValues
export type ActionHookName = keyof ActionValues
export type HookName = FilterHookName | ActionHookName

/**
 * Skema validasi nilai filter. Kunci di sini dan kunci `FilterValues` harus sama:
 * `Record` menolak kunci yang hilang maupun berlebih di salah satu sisi.
 */
const filterSchemaMap: Record<FilterHookName, z.ZodType> = {
  the_content: z.string(),
  the_title: z.string(),
  document_title: z.string(),
  body_class: z.string(),
  head_tags: z.array(z.string()),
  post_card: z.looseObject({ id: z.string().min(1), slug: z.string().min(1), title: z.string() }),
  widget_areas: z.array(z.looseObject({ id: z.string().min(1), type: z.string().min(1) })),
  admin_menu: z.array(
    z.looseObject({ id: z.string().min(1), label: z.string().min(1), href: z.string().min(1) }),
  ),
}

/** Skema validasi payload action. */
const actionSchemaMap: Record<ActionHookName, z.ZodType> = {
  option_changed: z.object({
    name: z.string().min(1).max(191),
    operation: z.enum(['add', 'update', 'delete']),
  }),
  post_saved: z.looseObject({
    id: z.string().min(1),
    slug: z.string().min(1),
    status: z.enum(['draft', 'pending', 'published']),
  }),
  post_published: z.looseObject({ id: z.string().min(1), slug: z.string().min(1) }),
  comment_approved: z.looseObject({ id: z.string().min(1), postId: z.string().min(1) }),
  plugin_activated: z.looseObject({ id: z.string().min(1), version: z.string().min(1) }),
  extensions_loaded: z.looseObject({ builtin: z.array(z.string()) }),
  plugins_loaded: z.looseObject({ plugins: z.array(z.string()) }),
  after_setup_theme: z.looseObject({ theme: z.string().min(1).nullable() }),
  init: z.looseObject({ booted: z.array(z.string()) }),
}

export const hookSchemas: Record<HookName, z.ZodType> = {
  ...filterSchemaMap,
  ...actionSchemaMap,
}

export type HookValidation = { ok: true } | { ok: false; message: string }

/**
 * Memeriksa satu nilai/payload terhadap skema hook-nya. Nama hook yang tidak
 * dikenal ditolak, bukan dilewatkan — hook yang salah tulis adalah bug titik
 * panggil, dan menolaknya membuat bug itu terlihat alih-alih senyap.
 */
export function validateHookValue(hook: HookName, value: unknown): HookValidation {
  const schema = hookSchemas[hook]
  if (!schema) return { ok: false, message: `hook tidak dikenal: ${String(hook)}` }
  const parsed = schema.safeParse(value)
  if (parsed.success) return { ok: true }
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(nilai)'}: ${issue.message}`)
    .join('; ')
  return { ok: false, message }
}

/**
 * Hook yang **belum punya titik panggil** di aplikasi, beserta alasannya.
 *
 * Dua nama ini sengaja didaftarkan sebagai nama yang sah (skemanya ada) tetapi
 * belum dipanggil di mana pun. Menyebutnya "terpasang" tanpa titik panggil akan
 * menyesatkan, jadi daftarnya eksplisit di sini. Hook yang tidak tercantum
 * harus memiliki titik panggil di dalam kode aplikasi.
 */
export const deferredHooks: Partial<Record<HookName, string>> = {
  head_tags:
    'menyisipkan HTML mentah ke <head> butuh keputusan sanitasi dan urutan dengan metadata Next; belum ada titik panggil',
  admin_menu:
    'menu admin masih berupa data di komponen klien components/admin/AdminShell.tsx; harus dipindahkan ke sisi server lebih dulu',
}
