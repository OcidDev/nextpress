# Pembaruan NextPress melalui dashboard pada server / VPS

Setelah penyiapan satu kali oleh operator, administrator cukup membuka
**Dasbor → Pembaruan → Perbarui NextPress**. Worker independen mengambil pekerjaan
dari database yang sama. Pengguna tidak perlu menjalankan `git pull`, memiliki
fork, atau membuka terminal untuk setiap rilis. Worker tetap berjalan ketika
dashboard ditutup atau aplikasi direstart.

Sumber pembaruan adalah **GitHub Release stabil** pada `OcidDev/nextpress`, dengan
manifest dan arsip resmi. Push biasa ke branch belum menjadi pembaruan.
`NEXTPRESS_RELEASE_OWNER` / `NEXTPRESS_RELEASE_REPOSITORY` dapat menunjuk penerbit
lain yang dipercaya operator. Aset rilis harus dapat diunduh dari GitHub.

## Kontrak instalasi

Worker mendukung Linux, Node.js >=22, pnpm sesuai `packageManager`, PostgreSQL,
`pg_dump` dan `pg_restore` dengan versi mayor yang sama dengan server database.
Periksa versi keduanya pada PATH service, bukan hanya shell operator. Contoh
service di bawah memakai client PostgreSQL 16 pada Debian/Ubuntu; sesuaikan
direktori tersebut jika server memakai versi lain. Sediakan minimal
2 GiB kosong untuk staging/build **ditambah ruang backup database**. Worker
menolak kegagalan backup atau build dan tidak menghapus backup/rilis lama otomatis;
operator menetapkan retensi dan memantau kapasitas disk.

```text
/srv/nextpress/
  current -> releases/initial
  releases/initial/             # instalasi pertama, sudah terbangun
  releases/<versi>-<job>/       # source resmi + dependency + build baru
  shared/.env.local             # konfigurasi instalasi, mode 0600
  backups/<job>.dump            # backup database, mode 0600
  updates/<job>.log             # log privat; jangan disajikan lewat web
  updates/<job>.json            # journal pekerjaan selesai
  updates/active/journal.json  # ada selama pemasangan / pemulihan tertunda
```

`current` wajib symlink. Source awal boleh clone repository sendiri asalkan
working tree bersih. Update berikutnya memasang source rilis resmi; commit kustom
pada core **tidak digabungkan** ke source baru. Simpan perubahan core dalam fork
penerbit rilis sendiri atau pindahkan penyesuaian ke tema/plugin. Source yang
diubah setelah pemasangan paket terkelola akan ditolak oleh pemeriksaan hash.
Direktori rilis lama tetap disimpan untuk pemulihan.

Konten, media, pengguna, pengaturan, dan paket tema/plugin yang dipasang melalui
dashboard tetap berada pada database instalasi. Ekstensi server-side yang
dikompilasi langsung ke core perlu dikelola melalui rilis fork sendiri.

## Penyiapan satu kali

Untuk instalasi baru, tempatkan clone pada `/srv/nextpress/releases/initial`,
kemudian ikuti langkah database, akun admin, dan build pada `self-hosted.md`.
Untuk instalasi lama, `current` boleh menunjuk direktori instalasi yang sudah ada;
tidak perlu memindahkan database atau menghapus source lama.

Dengan akun service `nextpress` yang memiliki direktori instalasi:

```bash
mkdir -p /srv/nextpress/{releases,shared,backups,updates}
chmod 700 /srv/nextpress/{shared,backups,updates}
# Ganti path ini dengan lokasi instalasi yang sudah berjalan.
ln -s /srv/nextpress/releases/initial /srv/nextpress/current
cp /srv/nextpress/current/.env.local /srv/nextpress/shared/.env.local
chmod 600 /srv/nextpress/shared/.env.local
```

Isi **file shared** di atas (JSON argv perlu dikutip agar tetap utuh saat dibaca
dotenv maupun `EnvironmentFile` systemd):

```dotenv
NEXTPRESS_DEPLOY_ADAPTER=self-hosted
NEXTPRESS_UPDATE_ROOT=/srv/nextpress
NEXTPRESS_UPDATE_RESTART_ARGV='["/usr/bin/sudo","-n","/usr/bin/systemctl","restart","nextpress.service"]'
```

Database, auth secret, dan origin pada file shared harus sama dengan instalasi
yang sedang berjalan. Kedua service membaca file tersebut. Setiap rilis baru
mendapat salinan privat file shared; perubahan konfigurasi dilakukan pada file
shared lalu restart service, bukan hanya pada salinan rilis lama.

Service aplikasi memakai `current` sebagai working directory. Contoh berikut
mengasumsikan Node.js dan pnpm terpasang pada `/usr/local/bin`; sesuaikan PATH dan
executable menurut server:

```ini
# /etc/systemd/system/nextpress.service
[Unit]
Description=NextPress
After=network.target

[Service]
User=nextpress
WorkingDirectory=/srv/nextpress/current
EnvironmentFile=/srv/nextpress/shared/.env.local
Environment=PATH=/usr/lib/postgresql/16/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/env pnpm start
Restart=on-failure
UMask=0077

[Install]
WantedBy=multi-user.target
```

Worker terpisah dari service aplikasi:

```ini
# /etc/systemd/system/nextpress-updater.service
[Unit]
Description=NextPress update worker
After=network.target nextpress.service

[Service]
User=nextpress
WorkingDirectory=/srv/nextpress/current
EnvironmentFile=/srv/nextpress/shared/.env.local
Environment=PATH=/usr/lib/postgresql/16/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/env pnpm update:worker
Restart=always
RestartSec=5
KillMode=control-group
TimeoutStopSec=90
UMask=0077

[Install]
WantedBy=multi-user.target
```

Gunakan `visudo` untuk mengizinkan **hanya** restart service aplikasi, sesuai
executable pada argv operator; worker tidak perlu berjalan sebagai root:

```sudoers
nextpress ALL=(root) NOPASSWD: /usr/bin/systemctl restart nextpress.service
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart nextpress
sudo systemctl enable --now nextpress-updater
```

Dashboard mengaktifkan metode Server / VPS setelah menerima heartbeat worker.
Worker polling setiap 5 detik. Untuk pemeriksaan satu siklus melalui terminal,
jalankan `pnpm update:worker --once` dengan environment yang sama. Perintah ini
**akan memproses** satu pekerjaan queued jika ada.

## Apa yang dilakukan setelah klik Perbarui

1. Server memeriksa izin `update_core`, versi lebih baru, kompatibilitas, serta
   manifest resmi; database menolak dua pekerjaan aktif sekaligus.
2. Worker mengunci antrean dan direktori instalasi. Ia mengambil ulang tag rilis
   yang diminta dan menolak commit yang berubah.
3. Paket diunduh dengan batas ukuran, SHA-256 diverifikasi, metadata commit dan
   versi paket dicocokkan. Traversal path, symlink, hardlink, dan berkas rahasia
   ditolak sebelum source ditulis pada staging.
4. Dependency dipasang memakai lockfile. Backup database dibuat dan diperiksa
   dengan `pg_restore --list`. Ini memverifikasi format backup; uji restore
   berkala ke database lain tetap diperlukan.
5. Worker membandingkan seluruh journal dan SQL migrasi antara versi terpasang
   dengan versi tujuan, memeriksa database, lalu membangun aplikasi baru.
6. Symlink `current` diganti secara atomik, aplikasi direstart lewat argv operator,
   lalu `/api/version` pada origin instalasi harus melaporkan versi **dan commit**
   tujuan sebelum pekerjaan dianggap selesai. Restart dapat menyebabkan jeda
   layanan singkat; ini bukan deployment tanpa downtime.
7. Jika restart atau pemeriksaan kesehatan gagal, worker mengembalikan symlink
   dan mencoba menjalankan versi sebelumnya. Database tidak dipulihkan otomatis.

## Batas otomatisasi dan pemulihan

- Versi pertama worker ini hanya memasang update tanpa perubahan schema.
  `rollbackSafe: false`, perbedaan journal/SQL, atau lompatan versi yang membawa
  migrasi akan ditolak. Operator perlu menjadwalkan maintenance untuk upgrade itu.
  Manifest `rollbackSafe` sendiri belum cukup karena nilainya relatif ke rilis
  sebelumnya, bukan selalu ke versi pengguna.
- Worker tidak menerima perintah shell, URL paket, target filesystem, atau
  kredensial baru dari browser. Log privat dapat memuat keluaran build/dependency;
  jangan mengirimnya ke dashboard atau menjadikannya berkas publik.
- Jika proses terputus atau rollback gagal, `updates/active` dipertahankan.
  Worker berikutnya menandai pekerjaan gagal dan menolak pemasangan baru.
  Pemulihan tidak pernah mengulangi migrasi atau menghapus database diam-diam.

Untuk memulihkan interupsi: hentikan `nextpress-updater`, pastikan tidak ada child
process instalasi/build yang masih berjalan, lalu baca `updates/active/journal.json`
dan log job. Periksa target `current`, versi yang melayani, dan backup. Bila perlu,
arahkan `current` ke path `previous` pada journal dengan symlink sementara lalu
`mv -T`, restart service, dan periksa `/api/version`. Setelah keadaan sehat
terverifikasi, **pindahkan** folder `updates/active` ke nama arsip recovery di
direktori yang sama, lalu jalankan worker lagi. Jangan hanya menghapus lock saat
proses lama masih hidup. Backup dan rilis lama tetap tersedia untuk pemeriksaan.

Tidak ada push Git, tag baru, atau perubahan repository pengguna ketika update
berjalan. Instalasi menerima rilis dari penerbit yang dikonfigurasi operator.
