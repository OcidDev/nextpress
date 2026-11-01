# Kontrak rilis NextPress

Dokumen ini menetapkan apa yang diterbitkan sebagai pembaruan NextPress, apa yang
**tidak** termasuk di dalamnya, dan bagaimana instalasi memverifikasi sebuah rilis.
Halaman pembaruan (Tahap 4) hanya boleh menawarkan rilis yang memenuhi kontrak ini.

## Sumber pembaruan

- Repositori resmi ditetapkan oleh `NEXTPRESS_RELEASE_OWNER` dan
  `NEXTPRESS_RELEASE_REPOSITORY` pada konfigurasi instalasi. Bawaannya
  `OcidDev/nextpress`.
- Sumbernya adalah **GitHub Release stabil terbaru** (`/releases/latest`). Commit
  pada branch `main` bukan pembaruan: hanya penerbitan Release yang menandai versi
  siap dipasang.
- Pre-release dan tag non-semver ditolak. Versi yang dipakai berbentuk
  `MAJOR.MINOR.PATCH`, tanpa sufiks `-rc`, `-beta`, atau metadata build.
- `NEXTPRESS_GITHUB_TOKEN` opsional. Nilainya hanya dibaca di server untuk menaikkan
  batas permintaan API GitHub; token tidak pernah dikirim ke browser. Pengunduh
  aset saat ini membutuhkan Release dengan aset yang dapat dibaca publik.

## Bentuk setiap rilis

Tag rilis adalah `v<version>` dan harus sama persis dengan `version` di
`package.json`. Setiap Release memuat dua aset:

| Aset                         | Isi                                                         |
| ---------------------------- | ----------------------------------------------------------- |
| `nextpress-<version>.tar.gz` | Source code pada commit tag tersebut.                       |
| `nextpress-release.json`     | Manifest yang dibaca halaman pembaruan.                     |

Manifest divalidasi secara ketat oleh `parseReleaseManifest` di
`lib/updates/release.ts`. Bidangnya:

```json
{
  "name": "nextpress",
  "version": "0.2.0",
  "tag": "v0.2.0",
  "commit": "40 karakter hash commit penuh",
  "releasedAt": "2026-10-17T00:00:00.000Z",
  "notes": "Catatan perubahan untuk operator",
  "requirements": { "node": "22.0.0", "packageManager": "pnpm@11.22.0" },
  "rollbackSafe": false,
  "migrations": { "count": 3, "upto": "0002_theme_deletion_permission" },
  "source": {
    "archive": "https://github.com/OcidDev/nextpress/releases/download/v0.2.0/nextpress-0.2.0.tar.gz",
    "sha256": "64 karakter heksadesimal",
    "bytes": 123456
  }
}
```

- `requirements.node` tidak boleh lebih rendah dari `22.0.0`.
- `migrations.upto` adalah nama file migrasi `drizzle/*.sql` terakhir tanpa `.sql`,
  atau `null` bila rilis belum punya migrasi.
- `rollbackSafe` bernilai `false` bila rilis menambahkan migrasi dibanding tag
  sebelumnya. Mengembalikan kode ke versi lama **tidak** otomatis membatalkan
  migrasi database; operator harus memutuskan rollback dengan sadar.
- `source.sha256` dan `source.bytes` dihitung dari arsip yang benar-benar
  diterbitkan. Pengunduh memasang hanya setelah keduanya cocok.

Arsip dibuat ulang secara deterministik dengan `git archive` pada commit tag, sehingga
riwayat git di luar tag tidak ikut serta.

## Yang tidak pernah ikut dalam paket

- `.env`, `.env.*`, dan file rahasia (`.pem`, kunci, token).
- Backup database, dump, dan `data/` lokal di luar isi yang dilacak git.
- Hasil build lokal (`.next`, `out`, `build`), `node_modules`, `.local/`.
- Log, hasil pengujian privat, dan file kerja pengembangan.

`scripts/package-release.mjs` menolak membuat paket bila ada path terlacak yang
cocok dengan daftar tersebut. Paket hanya memuat file yang dilacak git pada commit
tag, sehingga berkas yang di-gitignore tidak mungkin ikut.

## Pemisahan core dan data instalasi

Pembaruan mengganti kode NextPress, bukan isi situs. Saat memasang versi baru:

| Bagian                          | Perlakuan pembaruan                                            |
| ------------------------------- | -------------------------------------------------------------- |
| Source code, tema bawaan        | Diganti dengan versi rilis.                                     |
| `package.json`, lockfile        | Diganti; dependency dipasang dari lockfile rilis.               |
| Migrasi `drizzle/`              | Diterapkan berurutan setelah backup database.                   |
| Database (konten, akun, opsi)   | **Tidak** ditimpa oleh kode. Hanya migrasi yang mengubah skema. |
| `.env*`, kredensial             | Milik instalasi; tidak ada dalam paket dan tidak disentuh.      |
| Media unggahan, backup          | Milik instalasi; tidak disentuh.                                |
| Kustomisasi inti (`site`), menu, footer, sosial, bacaan | Tersimpan di database, bukan di file tema. |
| Revisi tampilan (draf/aktif/sebelumnya) | Tersimpan di database; hanya memuat chrome tema.         |
| Paket tema/plugin yang diunggah | Tersimpan di database; tidak tertimpa pembaruan core.           |

Konsekuensinya: perubahan source lokal pada file core akan tertimpa saat pembaruan.
Instalasi yang perlu kustomisasi harus memakai paket tema/plugin, pengaturan inti,
atau fork dengan versi sendiri — bukan mengedit file core di server produksi.
Worker VPS memeriksa perubahan source lokal sebelum mengganti versi aktif.
Adapter Vercel memakai source resmi dan tidak menggabungkan commit kustom pada
clone. Operator yang memerlukan perubahan core harus memakai penerbit rilis fork.

## Pemasangan pada instalasi independen

Instalasi tidak perlu memiliki tag baru pada clone sendiri. Dashboard membaca
Release penerbit, sedangkan proyek hosting, database, dan konfigurasi tetap milik
pengguna. Adapter dipilih melalui `NEXTPRESS_DEPLOY_ADAPTER`: `vercel` atau
`self-hosted`. Bila kosong, lingkungan Vercel memilih `vercel`; host lain memilih
`self-hosted`. Nilai yang tidak dikenal ditolak.

- VPS: worker terpisah mengambil job database, memverifikasi arsip SHA-256,
  metadata commit, versi paket, ukuran, dan keamanan path. Ia membuat backup,
  build di direktori baru, menukar symlink, restart, dan memeriksa versi/commit.
  Versi awal ini hanya menerima journal/SQL migrasi yang identik; upgrade schema
  memerlukan maintenance manual. Lihat `deployment/self-hosted-updates.md`.
- Vercel: adapter menemukan repository penerbit melalui API GitHub lalu meminta
  deployment pada proyek pengguna dengan tag/commit resmi yang dipin. Adapter
  ini tidak mengunduh atau memverifikasi byte arsip; identitas deployment diperiksa
  lewat commit provider dan `/api/version`. Akses provider lintas repository perlu
  diverifikasi pada akun tujuan. Lihat `deployment/vercel.md`.

Update tidak selesai hanya karena build diterima: versi dan commit pada origin
publik harus cocok. Worker yang terputus meninggalkan journal recovery dan
mengunci pemasangan berikutnya sampai operator memeriksa keadaan instalasi.

## Penerbitan

1. Naikkan `version` di `package.json` mengikuti semver dan tulis catatan perubahan.
2. Push commit ke `main`.
3. Buat tag `v<version>` dan push tag tersebut. Workflow
   `.github/workflows/nextpress-release.yml` menjalankan pemeriksaan tipe, lint,
   build, lalu membuat arsip dan manifest serta menerbitkan Release.
4. Jangan membuat Release secara manual tanpa aset manifest: halaman pembaruan akan
   menolaknya sebagai sumber tidak valid.

## Pengujian yang harus lulus

- Tag tidak sama dengan `version` → workflow berhenti.
- Release tanpa `nextpress-release.json`, manifest cacat, tag/manifest tidak cocok,
  arsip HTTPS selain GitHub, atau checksum tidak 64 heksadesimal → ditolak.
- Versi sama atau lebih lama → status "terbaru", tombol pembaruan tidak muncul.
- Node server di bawah `requirements.node` → rilis ditandai tidak kompatibel dengan
  alasan yang ditampilkan.
- GitHub 404/403/429 atau timeout → galat yang bisa ditampilkan tanpa menggagalkan
  halaman admin atau situs publik.
