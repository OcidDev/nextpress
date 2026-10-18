# Tinjauan keamanan dan kesiapan rilis — 18 Oktober 2026

**Keputusan: jangan merilis snapshot lama sebagai rilis produksi yang siap pakai.**
Perbaikan dalam working tree menutup temuan kode yang dijelaskan di bawah.
Rilis baru masih memerlukan rotasi kredensial terdampak, verifikasi konfigurasi
hosting, dan pemeriksaan CI pada commit yang akan diberi tag.

Basis pemeriksaan: commit `e9696f8` ditambah perubahan audit ini. Tidak ada
deployment, publikasi tag, perubahan password akun nyata, atau migrasi database
aplikasi pengguna dalam audit ini. Pengujian memakai instance PostgreSQL 16
terpisah, akun acak, dan browser Chromium lokal. Build uji memakai origin
`http://localhost:3109`; buat ulang build dengan variabel produksi saat deploy.

## Temuan dan perbaikan

| Prioritas                   | Temuan sebelum perbaikan                                                                                                                   | Penanganan                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tinggi                      | Form login tidak memiliki `method`; sebelum hydration atau tanpa JavaScript, browser dapat mengirim email/password lewat GET ke URL.       | Form menetapkan POST ke handler Better Auth. Submit native tetap melalui pemeriksaan CSRF/rate limit, cookie diteruskan, hasil diarahkan dengan 303 ke URL tetap. Query kredensial lama dibersihkan sebelum render; referrer admin/auth dibatasi.         |
| Tinggi                      | Skrip reset admin mempunyai password dan email bawaan; password juga dicetak ke stdout dan dapat diberikan lewat argv.                     | Hilangkan bawaan dan output password; prompt tersembunyi atau secret environment wajib. Tolak argumen password; pertahankan peran/status akun dan cabut sesi. Riwayat Git lama tetap memuat fallback lama: password yang pernah memakainya harus diganti. |
| Tinggi, dengan peran kustom | `saveUserData` memeriksa izin peran tujuan, tetapi tidak memeriksa kekuasaan akun target sebelum menurunkan peran/mengganti kredensialnya. | Periksa peran akun lama dan peran tujuan terhadap actor di transaksi. Batasi juga penautan profil lama ke akun yang lebih berkuasa. Peran bawaan selain administrator tidak memiliki `edit_users`.                                                        |
| Sedang                      | Verifikasi password profil memakai read/check/update terpisah; request paralel dapat lolos melewati batas.                                 | Reservasi percobaan secara atomik sebelum hashing; 20 request bersamaan hanya meloloskan 5. Periksa ulang hash di transaksi sebelum mengubah password/email agar kredensial yang berubah tidak ditimpa.                                                   |
| Sedang, bergantung ingress  | Komentar/views mempercayai token pertama `X-Forwarded-For`; contoh Nginx tidak menimpanya.                                                 | Satu header IP terkonfigurasi dipakai bersama autentikasi, komentar, dan views. Tolak rantai/format ambigu, gunakan bucket bersama bila tidak valid. Dokumentasikan proxy yang menimpa header dan port app yang privat.                                   |
| Sedang, perlindungan rilis  | Pemeriksaan arsip hanya menolak nama literal `.pem`, bukan `server.pem`; beberapa artefak lokal belum ditolak.                             | Guard menolak ekstensi key/backup, `.vercel`, hasil browser test, env nyata, serta direktori lokal. LICENSE wajib masuk arsip.                                                                                                                            |
| Kesiapan open source        | LICENSE tidak ada; Google Sans hanya disertai alamat unduhan tanpa berkas lisensi distribusi.                                              | Tambahkan GPL-3.0-only sesuai pilihan pemilik. Ganti font aplikasi dengan Inter yang sudah memiliki OFL; gunakan monospace sistem. Hapus tiga berkas Google Sans dari snapshot baru. Lisensi font tetap terpisah.                                         |
| Kesiapan rilis              | Tidak ada suite regresi yang dijalankan CI; hitungan migrasi rilis sebelumnya tidak cocok dengan prefix `drizzle/`.                        | Tambahkan tes unit/browser, workflow PR/push dan pemeriksaan sebelum rilis. Koreksi perhitungan rollback-safe untuk rilis tanpa migrasi baru.                                                                                                             |

## Dependency yang masih perlu dipantau

`pnpm audit --prod` tidak menemukan advisory pada dependency produksi saat audit.
Audit seluruh dependency masih melaporkan **1 high**, `braces@3.0.3`, melalui
`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch`.
Ini adalah jalur tooling lint, bukan jalur input HTTP aplikasi yang ditemukan.

Advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
menjelaskan stack exhaustion pada pola brace bertingkat. Respons audit registry
menyebut batas patched `>=3.0.4`, tetapi `pnpm view braces version` masih
mengembalikan `3.0.3` dan halaman advisory menyatakan belum ada versi patched.
Karena itu tidak ditambahkan override ke versi yang belum tersedia, dan temuan
tidak disembunyikan. Pantau pembaruan upstream, hindari pola glob dari input tak
tepercaya, dan jalankan tooling pada CI terisolasi. Ini bukan klaim audit penuh
bersih; keputusan rilis harus mencatat pengecualian development dependency ini.

## Cakupan pemeriksaan

- Alur login, session, signup nonaktif, cookie, CSRF, rate limit, reset admin,
  perubahan profil, dan batas izin pengelolaan pengguna.
- Guard server actions serta scope konten/media; route admin, preview, endpoint
  publik, cron, dan pemisahan artikel draft dari daftar publik.
- Sanitasi HTML, keluaran filter konten, CSS tema, batas ZIP, traversal path,
  batas dekompresi, ekstensi berkas, dan sandbox iframe plugin.
- Jalur pemeriksaan rilis GitHub/deployment Vercel, guard berkas arsip,
  konfigurasi backup/restore, migrasi, environment, dan workflow rilis.
- Seluruh 20 commit yang tersedia secara lokal: 977 objek Git diperiksa untuk
  kecocokan nilai secret sensitif dari `.env.local`, pola private key, token
  GitHub/AWS, dan path env/backup sensitif. Tidak ditemukan kecocokan dalam
  pemindaian tersebut. Pemindaian pola ini tidak membuktikan semua jenis secret
  atau kredensial historis tidak ada; fallback password dalam kode adalah
  temuan terpisah di atas. `.env.local` dan `.local` tidak terlacak oleh Git.

Pemeriksaan sumber tidak sama dengan pentest semua kombinasi input. Integrasi
Redis/cron, deployment provider, domain produksi, permission database produksi,
dan pemulihan backup produksi nyata belum diuji secara end-to-end. Upgrade dan
backup/restore data fixture pada PostgreSQL terpisah sudah diuji otomatis.

## Bukti verifikasi

| Pemeriksaan                         | Hasil                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                         | Lolos; `next lint` mengeluarkan pemberitahuan deprecation.                                                                                       |
| `pnpm typecheck`                    | Lolos.                                                                                                                                           |
| `pnpm test:security`                | 11 tes lolos: guard rilis, XSS, izin objek/peran, IP, ZIP, sandbox, CSS, dan XML.                                                                |
| `pnpm test:e2e`                     | 16 tes lolos: keamanan login/akses dan alur artikel/halaman, revisi, trash, media, WXR/Blogger, tema dan plugin.                                 |
| `pnpm db:migrate` + `pnpm db:check` | Empat migrasi diterapkan pada database kosong terpisah dan lolos.                                                                                |
| `pnpm test:db`                      | Lolos pada Node.js 22: upgrade database berisi data, rerun migrasi, backup/restore semua tabel persisten dan media; sesi/token tidak dipulihkan. |
| `pnpm build`                        | Build produksi berhasil.                                                                                                                         |
| `pnpm audit --prod`                 | Tidak ada advisory yang diketahui saat pemeriksaan.                                                                                              |
| `pnpm audit`                        | Satu high pada tooling `braces`; belum terselesaikan upstream.                                                                                   |
| Pengemasan rilis                    | Diuji dalam repository Git sementara; arsip/manifest terbentuk, rilis awal tidak rollback-safe, rilis tanpa tambahan migrasi rollback-safe.      |

Verifikasi lanjutan memakai Node.js 22.23.3, pnpm 11.22.0, PostgreSQL 16, dan
Chromium. Versi kandidat adalah 0.2.1. GitHub Actions harus lolos pada commit final;
verifikasi browser pada hosting nyata tetap diperlukan sebelum pengumuman produksi.

## Yang perlu diselesaikan sebelum rilis produksi

1. Deploy perbaikan dan **ganti password yang pernah muncul di URL**, serta
   password yang pernah memakai fallback skrip reset. Gunakan CLI yang sudah
   diperbaiki atau form profil; sesi lama dicabut. Bersihkan history, screenshot,
   dan log terdampak yang berada di bawah kendali operator. HTTPS tidak menghapus
   kebocoran query yang sudah tersimpan.
2. Verifikasi HTTPS, kesamaan origin auth/site, cookie `Secure` pada HTTPS,
   header IP dari ingress, port aplikasi privat, rate limit, serta no-store pada
   host tujuan. Jangan log body autentikasi, cookies, atau Authorization.
3. Jalankan CI pada commit final, beri versi/tag patch baru, dan pastikan arsip
   rilis baru memuat LICENSE serta semua perbaikan ini. Catat pengecualian
   `braces` bila belum tersedia patch upstream.
4. Batasi permission token deployment dan verifikasi integrasi opsional yang
   digunakan. Kanal laporan keamanan privat GitHub telah diaktifkan dan statusnya
   diverifikasi melalui API. Upgrade dan restore ke database fixture terpisah lolos.

## Batas produk yang perlu dijelaskan

- Media CMS memang publik melalui URL, termasuk media untuk draft. Jangan
  menggunakannya untuk dokumen rahasia.
- CSP aplikasi utama belum merupakan kebijakan pembatasan script yang lengkap;
  sanitasi konten tetap menjadi pertahanan XSS utama. Frame plugin memiliki CSP
  sandbox yang lebih ketat. Server extension yang dikompilasi adalah kode tepercaya.
- Batas impor kini 4 MB pada UI dan server, di bawah batas hosting Vercel dan
  Server Actions. Ekspor yang lebih besar harus dipecah. Batas jumlah entri
  menghasilkan galat, bukan pemotongan diam-diam. WXR mendukung pos/laman;
  komentar, media, bidang kustom, kategori, dan tag belum dibawa oleh importer.
  Ekspor WXR bukan backup instalasi lengkap. Round-trip XML/entity/CDATA diuji.

Referensi implementasi: [Better Auth security](https://better-auth.com/docs/reference/security),
[Next.js data security](https://nextjs.org/docs/15/app/guides/data-security), dan
[header ingress Vercel](https://vercel.com/docs/headers/request-headers).
