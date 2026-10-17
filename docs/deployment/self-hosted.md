# Memasang NextPress di server sendiri

Panduan ini memasang NextPress baru pada VPS atau server sendiri (Node.js +
PostgreSQL). Untuk Vercel, gunakan [`vercel.md`](vercel.md).

## Yang dibutuhkan

- Node.js 22 atau lebih baru dan pnpm 11.22.0.
- PostgreSQL 16 yang dapat dijangkau proses Node.js.
- Domain yang menunjuk ke server, bila situs dipublikasikan. HTTPS sebaiknya
  diterminasi reverse proxy (Nginx, Caddy, atau Traefik).
- Ruang disk untuk source, build Next.js (`.next`), dan database. Media diunggah
  disimpan sebagai `bytea` di tabel `cms_media`, jadi tidak ada direktori upload
  yang perlu disiapkan atau di-backup terpisah.

## 1. Ambil kode rilis stabil

Gunakan tag rilis, bukan branch `main` atau `dev`. Hanya tag yang menerbitkan
GitHub Release yang dianggap versi siap pakai (lihat
[`../release-contract.md`](../release-contract.md)).

```bash
git clone https://github.com/OcidDev/nextpress.git /srv/nextpress
cd /srv/nextpress
git checkout v0.2.0
pnpm install --frozen-lockfile
```

Aktifkan pnpm dengan versi yang dikunci `packageManager`:

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
```

## 2. Siapkan database

Buat role dan database kosong. NextPress tidak membutuhkan ekstensi khusus, dan
role aplikasi tidak perlu hak `CREATEDB` — cukup hak atas database yang dipakai.

```bash
sudo -u postgres psql <<'SQL'
create role nextpress login password 'GANTI_SANDI';
create database nextpress owner nextpress;
SQL
```

Database harus **kosong**. Jangan arahkan `DATABASE_URL` ke database yang
riwayat migrasinya berasal dari instalasi lain; `pnpm db:migrate` akan gagal pada
objek yang sudah ada, dan migrasi tidak boleh dijalankan mundur. Untuk memindahkan
situs lama, impor konten setelah instalasi baru berjalan, jangan menyalin database
mentah.

## 3. Buat `.env.local`

```bash
cp .env.example .env.local
chmod 600 .env.local
```

Isi minimal:

```dotenv
DATABASE_URL="postgresql://nextpress:GANTI_SANDI@127.0.0.1:5432/nextpress"
NEXT_PUBLIC_SITE_URL="https://contoh.com"
BETTER_AUTH_URL="https://contoh.com"
BETTER_AUTH_SECRET="hasil openssl rand -hex 32"
```

- `NEXT_PUBLIC_SITE_URL` dan `BETTER_AUTH_URL` harus memakai origin yang sama,
  termasuk skema dan port. Nilai yang berbeda membuat sesi login dan tautan
  absolut salah.
- `BETTER_AUTH_SECRET` dibuat dengan `openssl rand -hex 32` dan berbeda untuk
  setiap environment.
- `NEXT_PUBLIC_MEDIA_MAX_MB` dibatasi 1–5 MB.
- `UPSTASH_REDIS_REST_URL`/`TOKEN`, analytics, dan adapter Vercel bersifat
  opsional; lihat komentar di `.env.example`.
- `.env.local` diabaikan git. Jangan menaruh sandi di variabel `NEXT_PUBLIC_*`
  karena nilainya ikut terkirim ke browser.

## 4. Migrasi dan akun admin

```bash
pnpm db:migrate   # "migrations applied successfully"
pnpm db:check     # "Database siap: 4 migrasi tercatat; hierarki kategori tersedia."
pnpm admin:create
```

`admin:create` menanyakan nama, email, dan kata sandi (minimal 12 karakter).
Perintah ini hanya boleh berhasil sekali per database; jalankan ulang tanpa
menghapus data tidak akan membuat admin kedua. Untuk otomasi, isi `ADMIN_NAME`,
`ADMIN_EMAIL`, dan `ADMIN_PASSWORD` sebagai variabel lingkungan.

## 5. Build dan jalankan

```bash
pnpm build
pnpm start        # default http://localhost:3000
```

`pnpm dev` hanya untuk pengembangan: mode ini mengompilasi saat diminta dan tidak
memakai build produksi.

Jalankan `pnpm start` di bawah process manager agar hidup setelah reboot, misalnya
systemd:

```ini
[Unit]
Description=NextPress
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/srv/nextpress
EnvironmentFile=/srv/nextpress/.env.local
ExecStart=/usr/bin/env pnpm start
Restart=on-failure
User=nextpress

[Install]
WantedBy=multi-user.target
```

Sesuaikan `ExecStart` dengan lokasi pnpm pada mesin (`command -v pnpm`). Pastikan
user service dapat membaca `.env.local` dan menulis ke `.next/`.

## 6. Reverse proxy dan HTTPS

Teruskan permintaan ke port 3000 dan pertahankan header asli. Contoh Nginx:

```nginx
server {
  server_name contoh.com;
  client_max_body_size 6m;   # sedikit di atas batas media 5 MB

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Batas unggah media berlaku dari `NEXT_PUBLIC_MEDIA_MAX_MB`; `client_max_body_size`
reverse proxy harus lebih besar darinya, kalau tidak unggahan ditolak sebelum
mencapai aplikasi.

## 7. Pasang tema dan plugin

Tidak ada perintah CLI untuk memasang paket. Setelah masuk ke `/admin/login`:

1. **Tema** — buka **Tampilan** (`/admin/appearance`), tekan **+ Unggah Tema Baru**,
   pilih ZIP (maksimal 4 MB), lalu **Pasang Sekarang**. Paket baru selalu
   terpasang nonaktif; tekan **Aktifkan** untuk memakainya. Tema bawaan Twenty
   Twenty-Four (`core-default`) sudah tersedia dan tidak perlu diunggah.
2. **Plugin** — buka **Plugin** (`/admin/plugins`), unggah ZIP (maksimal 2 MB), lalu
   **Pasang plugin**. Aktifkan, lalu buka **Pengaturan dan penempatan widget**,
   centang slot yang diinginkan (Awal beranda, Akhir beranda, Setelah artikel,
   Sebelum footer), dan simpan.

Tema dan plugin harus memenuhi format di `lib/themes/package.ts` dan
`lib/plugins/manifest.ts`. Pemasangan melalui browser saja tidak cukup untuk
ekstensi server-side seperti `contentSeo`: modulnya harus dikompilasi ke build dan
didaftarkan di `lib/plugins/content-seo-server.ts`, yang bawaannya kosong.

## 8. Pembaruan

Pada server sendiri, `Dasbor → Pembaruan` belum memiliki adapter yang dapat
menjalankan update; halaman itu hanya berlaku untuk Vercel. Perbarui secara
manual, dengan urutan yang menjaga situs tetap melayani:

```bash
pnpm db:backup /var/backups/nextpress-$(date +%F-%H%M).dump
git fetch --tags
git checkout v0.2.1          # ganti dengan tag rilis berikutnya
pnpm install --frozen-lockfile
pnpm db:migrate && pnpm db:check
pnpm build
systemctl restart nextpress
curl -fsS https://contoh.com/api/version
```

Jangan menjalankan `pnpm build` langsung di direktori yang sedang melayani bila
ingin tanpa downtime; build di salinan terpisah lalu tukar direktori saat restart.
Rollback kode tidak membatalkan migrasi database. Bila manifest rilis menyatakan
`rollbackSafe: false`, kembalikan database dari backup, bukan dengan migrasi mundur.

## 9. Backup dan pemulihan

- `pnpm db:backup <file.dump>` memakai `pg_dump` format custom, menolak menimpa
  berkas yang sudah ada, dan melewati tabel sesi/verifikasi/rate-limit.
- `pnpm db:restore <file.dump> <nama-database>` memakai `RESTORE_DATABASE_URL`
  (bukan `DATABASE_URL`) dan mewajibkan nama database sebagai argumen kedua agar
  salah target tidak terjadi tanpa sengaja. Perintah ini memakai `--clean`.
- Backup rutin cukup pada database: konten, media, tema/plugin terpasang, dan
  pengaturan semuanya tersimpan di sana.
- Uji pemulihan ke database lain lewat `RESTORE_DATABASE_URL` sebelum
  mengandalkannya pada produksi. Sesi login tidak ikut dipulihkan.

## Pemecahan masalah

| Gejala | Penyebab umum |
| ------ | ------------- |
| `pnpm db:migrate` gagal pada `relation "…" already exists` | Database tidak kosong atau berasal dari riwayat migrasi lain; pakai database baru lalu impor konten. |
| Login berhasil tetapi kembali ke halaman masuk | `BETTER_AUTH_URL` berbeda origin dari URL yang dibuka; samakan dengan `NEXT_PUBLIC_SITE_URL`. |
| Gambar gagal diunggah | Batas `NEXT_PUBLIC_MEDIA_MAX_MB` atau `client_max_body_size` reverse proxy. |
| Zip tema/plugin ditolak | Ukuran, nama berkas, atau `theme.manifest.json`/`plugin.json` tidak sesuai format; pesan galat menyebut berkasnya. |
| `Database siap` gagal setelah migrasi | `pnpm db:check` memeriksa tabel hierarki kategori; jalankan migrasi pada database yang benar. |
