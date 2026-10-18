# Deploy NextPress ke Vercel

NextPress berjalan di Vercel tanpa filesystem persisten: media disimpan di
database, dan aplikasi hanya membutuhkan host serta PostgreSQL terkelola. Halaman
`Dasbor → Pembaruan` memakai adapter Vercel untuk memasang rilis yang sudah
diterbitkan di GitHub.

## Yang dibutuhkan

- Repository GitHub yang memuat source NextPress (privat atau publik).
- Proyek Vercel yang terhubung ke repository tersebut.
- PostgreSQL terkelola yang dapat dijangkau dari jaringan Vercel (Neon, Supabase,
  Railway, atau RDS). Aktifkan TLS dan simpan connection string hanya di variabel
  server.
- Rilis stabil pertama (`v0.1.0`, dst.) di repository Release resmi.

## Variabel lingkungan

Isi di **Project Settings → Environment Variables** untuk environment
*Production* (dan *Preview* bila preview dipakai untuk uji):

| Nama                         | Wajib | Keterangan                                                                 |
| ---------------------------- | ----- | -------------------------------------------------------------------------- |
| `DATABASE_URL`               | ya    | Connection string PostgreSQL, termasuk `sslmode=require` bila didukung.     |
| `NEXT_PUBLIC_SITE_URL`       | ya    | Origin produksi, mis. `https://contoh.com`. Dipakai untuk pemeriksaan versi. |
| `BETTER_AUTH_URL`            | ya    | Origin yang sama dengan `NEXT_PUBLIC_SITE_URL`.                             |
| `BETTER_AUTH_SECRET`         | ya    | `openssl rand -hex 32`, berbeda per environment.                            |
| `NEXTPRESS_CLIENT_IP_HEADER` | ya    | `x-forwarded-for`; gunakan header satu IP yang ditimpa ingress Vercel.       |
| `VERCEL_TOKEN`               | ya\*  | Token dengan izin membuat deployment pada proyek ini.                       |
| `VERCEL_PROJECT_ID`          | ya\*  | ID proyek (`prj_…`).                                                        |
| `VERCEL_REPO_ID`             | ya\*  | ID repository GitHub (`123456789`), bukan `owner/name`.                      |
| `VERCEL_TEAM_ID`             | ya\*\*| ID tim (`team_…`).                                                          |
| `VERCEL_TEAM_SLUG`           | ya\*\*| Alternatif `VERCEL_TEAM_ID` untuk akun tim.                                 |
| `NEXTPRESS_RELEASE_OWNER`    | tidak | Bawaan `OcidDev`.                                                           |
| `NEXTPRESS_RELEASE_REPOSITORY` | tidak | Bawaan `nextpress`.                                                       |
| `NEXTPRESS_GITHUB_TOKEN`     | tidak | Hanya menaikkan batas API GitHub atau membaca repo privat. Tanpa izin tulis. |

\* Hanya diperlukan bila tombol **Perbarui NextPress** dipakai; halaman tetap
berfungsi tanpa itu dan menjelaskan variabel yang belum diisi.
\*\* Pilih salah satu untuk akun tim.

`VERCEL_REPO_ID` dapat dilihat di URL repository GitHub atau lewat API
`/v2/projects/{projectId}`. Jangan menaruh token Vercel di pengaturan situs,
variabel `NEXT_PUBLIC_*`, atau paket tema/plugin.

## Alur deployment

`vercel.json` menjalankan `pnpm vercel-build` (`scripts/vercel-build.mjs`):

1. Pada deployment **produksi**, `pnpm db:migrate` lalu `pnpm db:check` dijalankan
   sebelum `pnpm build`. Migrasi bersifat aditif sehingga build lama tetap dapat
   melayani selama build baru berjalan. Migrasi yang gagal menghentikan deployment.
2. Preview build tidak menyentuh database.
3. `pnpm build` menghasilkan build Next.js.

Backup database tidak dilakukan otomatis. Ambil backup manual (atau snapshot
provider) sebelum memulai pembaruan yang membawa migrasi; halaman pembaruan
menampilkan jumlah migrasi dan nama migrasi terakhir dari manifest rilis.

## Pembaruan dari admin

1. Halaman `Dasbor → Pembaruan` memeriksa GitHub Release stabil terbaru. Hasil
   disimpan di database dan dipakai ulang selama 15 menit; tombol **Cek pembaruan**
   memaksa pemeriksaan baru.
2. **Perbarui NextPress** mengirim tag yang ditampilkan ke server. Server mengambil
   ulang manifest, memvalidasi versi, commit, checksum, dan kompatibilitas Node,
   lalu meminta Vercel membangun deployment produksi yang terikat pada `ref` tag
   dan `sha` commit tersebut. Browser tidak pernah mengirim URL atau perintah.
3. Pekerjaan dicatat di tabel `update_jobs`; indeks unik parsial hanya
   mengizinkan satu pekerjaan aktif.
4. Halaman memantau status deployment Vercel (`QUEUED` → `INITIALIZING` →
   `BUILDING` → `READY`/`ERROR`). Setelah `READY`, aplikasi memanggil
   `GET /api/version` pada origin produksi. Pekerjaan baru ditandai **Selesai**
   ketika versi yang benar-benar melayani sama dengan versi tujuan; status
   provider saja tidak dianggap bukti update terpasang.
5. Bila provider tidak menjawab lebih dari satu jam, halaman menandai pekerjaan
   sebagai basi. Deployment yang gagal dicatat dengan pesan provider; kode lama
   tetap melayani sampai deployment baru sukses.

Rollback: deploy ulang tag sebelumnya dari dasbor Vercel dan pantau
`/api/version`. Rollback kode tidak membatalkan migrasi database — periksa
`rollbackSafe` pada manifest; bila `false`, kembalikan database dari backup,
bukan dengan menjalankan migrasi mundur.

## Batasan

- Satu deployment produksi per proyek; tidak ada staging otomatis.
- Deployment Protection harus dimatikan untuk alias produksi, karena pemeriksaan
  versi memanggil origin publik tanpa kredensial.
- Update penuh memerlukan build Vercel; untuk instalasi yang membutuhkan kontrol
  filesystem (mis. plugin server-side kustom), gunakan host/VPS dengan worker
  pembaruan terpisah (Tahap 5, bagian server/VPS).
