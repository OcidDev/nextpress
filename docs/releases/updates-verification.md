# Verifikasi updater instalasi independen — 31 Oktober 2026

Implementasi menambahkan worker VPS dan menyesuaikan adapter Vercel agar
instalasi clone mengikuti repository penerbit rilis. Pengujian menggunakan
Node.js 26.7.0, pnpm 11.22.0, PostgreSQL 16 terpisah, dan Chromium lokal.
Tidak ada deployment, migrasi database pengguna, push Git, atau tag rilis nyata.

## Hasil akhir

| Pemeriksaan | Hasil |
| --- | --- |
| Install dengan frozen lockfile | Lulus; tidak ada dependency baru |
| Lint dan typecheck | Lulus |
| Build produksi | Lulus |
| Keamanan / impor | 11 lulus |
| Tema / tata letak | 18 lulus, termasuk subtes lifecycle |
| Migrasi dan backup/restore | 1 lulus |
| Unit dan simulasi kegagalan updater | 24 lulus |
| Antrean PostgreSQL dan uji proses updater | 2 lulus |
| Browser seluruh suite | 22 lulus |

Total: **78 lulus, 0 gagal, 0 dilewati** pada pengujian akhir.

Pengunduh juga berhasil membaca arsip NextPress lengkap dari commit `2d1c145`
(533 berkas), bukan hanya paket mini fixture. Endpoint `/api/version` pada build
lokal mengembalikan versi `0.2.1` dan commit fixture yang dipasang saat build.

## Bukti yang dicakup

- Validasi GitHub Release, tag, sumber aset resmi, versi, runtime, checksum,
  metadata commit, ukuran, tar traversal, symlink/hardlink, dan path rahasia.
- Instalasi staging, pemeriksaan source lokal, konfigurasi database sama,
  backup gagal, build gagal, restart gagal, kesehatan gagal, rollback kode,
  rollback gagal, dan penolakan update baru ketika lock recovery masih ada.
- Antrean PostgreSQL persisten menolak job ganda dan worker bersamaan; job
  terbengkalai dilaporkan gagal, sedangkan journal interupsi memblokir pemasangan.
- Uji sistem memakai perintah pnpm install/build dan pg_dump/pg_restore sungguhan,
  source fixture terverifikasi, serta restart server HTTP fixture yang melayani
  versi/commit. Data database uji tetap sama dan backup bisa dibaca. Source fixture
  ini kecil, bukan simulasi deployment CMS penuh ke VPS publik.
- Browser memverifikasi tombol dashboard membuat job dari manifest resmi fixture,
  job tetap tersimpan sesudah tab ditutup, tab lama tidak membuat job kedua,
  worker belum siap dan perubahan schema menonaktifkan tombol, serta pencabutan
  izin administrator menolak server action dari halaman yang sudah terbuka.
- API Vercel diuji dengan respons mock: ID repository clone tidak dipakai sebagai
  sumber rilis; error alias dilaporkan dan commit provider dipakai untuk validasi.

Fixture GitHub pada tes browser hanya dimuat melalui preload proses test server
di konfigurasi Playwright. Kode produksi tidak memiliki URL fixture atau opsi
untuk melewati verifikasi manifest/checksum.

## Batas yang belum boleh dinyatakan lulus produksi

- Belum diuji pada akun Vercel nyata. Akses provider ke repository penerbit yang
  berbeda dari clone pengguna dapat bergantung pada izin/kebijakan proyek.
- Worker VPS memerlukan penyiapan satu kali (symlink current, shared environment,
  worker service, pg_dump/pg_restore, dan izin restart service terbatas).
- Worker versi ini menolak perubahan journal/SQL migrasi. Upgrade schema tetap
  memerlukan maintenance operator; tidak ada restore database otomatis.
- Backup diperiksa formatnya dengan `pg_restore --list`; lakukan uji restore
  berkala pada database terpisah. Sistem tidak menjanjikan tanpa downtime.
- Pemeriksaan CI Node.js 22 pada commit final dan verifikasi hosting tujuan tetap
  diperlukan. Hasil lokal tidak membuktikan konfigurasi semua VPS/provider.
- Dependency tidak berubah pada pekerjaan ini. Pengecualian tooling `minimatch`
  dari catatan rilis sebelumnya tetap berlaku sampai audit/upstream diperbarui.

Panduan operasi dan recovery: [`../deployment/self-hosted-updates.md`](../deployment/self-hosted-updates.md).
