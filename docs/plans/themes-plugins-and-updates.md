# Rencana pembersihan ekstensi dan pembaruan NextPress

Tanggal: 17 Oktober 2026.
Status: direncanakan; implementasi belum dimulai.
Dasar: commit `39e61b5` (pengaturan situs dan siklus editorial).

## Tujuan

1. Menghapus sisa implementasi tema/plugin lama yang sudah tidak diperlukan.
2. Menyediakan penghapusan tema dan plugin yang konsisten melalui admin.
3. Membuat instalasi NextPress dapat mendeteksi dan memasang versi baru dari
   repositori GitHub resmi melalui halaman pembaruan.

## Temuan awal dari repositori

| Bagian               | Kondisi saat ini                                                                                                                       | Tindak lanjut                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tema aktif           | Menggunakan paket ZIP, registry blok, dan customizer paket. Tema bawaan adalah `core-default` / Twenty Twenty-Four.                    | Pertahankan mesin paket dan satu tema pemulihan bawaan.                                                               |
| Hapus tema           | Belum ada operasi hapus di manager maupun server action.                                                                               | Tambahkan penyimpanan, pemeriksaan referensi, dan UI.                                                                 |
| Hapus plugin         | Sudah ada di `PluginManager`, `uninstallPlugin`, dan `uninstallPluginData`. Plugin aktif dan referensi tampilan membatasi penghapusan. | Uji serta lengkapi alurnya, tanpa membuat mekanisme kedua.                                                            |
| Preview tema starter | `/preview/template/[name]` masih membaca `examples/themes/starter` melalui `lib/themes/starter-files.ts`.                              | Kandidat penghapusan setelah memastikan tidak ada pemakai yang perlu dipindahkan.                                     |
| Tampilan lama        | Cabang kapabilitas `appearance-editor` masih ada pada renderer, site editor, dan penyimpanan tampilan.                                 | Petakan pemakai paket dan data sebelum menghapus cabang lama.                                                         |
| Alias tema           | `twentytwentyfour` masih dinormalisasi ke `core-default`.                                                                              | Periksa data tersimpan dan siapkan migrasi jika alias dilepas.                                                        |
| Ekstensi contoh      | `extensions/example-reading-time.ts` masih ada, tetapi registry ekstensi bawaan kosong.                                                | Pisahkan contoh pengembangan dari runtime; hapus contoh jika tidak lagi diperlukan.                                   |
| SEO plugin           | Registry runtime dan panel kosong, tetapi kontrak ekstensi masih ada.                                                                  | Bedakan API ekstensi yang disengaja dari sisa plugin tertentu; jangan menganggap seluruh API ini sebagai plugin lama. |
| Sumber update        | Versi aplikasi `0.1.0`; belum ada Git remote pada checkout ini maupun updater aplikasi.                                                | Tetapkan repositori sumber dan kontrak rilis terlebih dahulu.                                                         |

Temuan ini belum merupakan audit lengkap database. Paket yang sudah tidak ada di
source masih mungkin tersimpan dalam database. Tema bawaan yang sedang digunakan
tidak otomatis dianggap sebagai tema lama yang harus dibuang.

## Tahap 1 — Bersihkan sisa implementasi lama

- Inventarisasi import, route, contoh paket, asset, konfigurasi, dan data paket
  terpasang. Telusuri juga referensi pada halaman, draft tampilan, versi pemulihan,
  dan riwayat revisi.
- Tentukan implementasi paket yang menjadi sumber utama. Pindahkan fungsi yang
  masih diperlukan dari cabang lama sebelum menghapusnya.
- Pisahkan data inti situs—menu, footer, sosial, identitas—dari konfigurasi khusus
  tema. Pengaturan inti harus tetap bekerja setelah pembersihan.
- Hapus kode, route preview, asset, dan contoh yang terbukti tidak dipakai;
  regenerasi bundle tema dan perbarui dokumentasi yang menunjuk bagian tersebut.
- Jika ditemukan data lama, buat migrasi baru yang mempertahankan konten dan
  memetakan referensi ke penggantinya. Jangan mengubah migrasi yang sudah diterapkan.
- Perbarui pesan lama yang masih menyebut nomor migrasi yang tidak sesuai dengan
  riwayat migrasi repositori saat ini.

Selesai ketika situs publik, preview, pengaturan inti, instalasi paket, dan pergantian
tema tetap bekerja tanpa bergantung pada implementasi yang dihapus.

## Tahap 2 — Lengkapi hapus tema dan plugin

### Tema

- Tambahkan tombol Hapus pada detail tema serta capability untuk penghapusan.
- Tema aktif harus diganti terlebih dahulu. Tema pemulihan yang dibundel bersama
  aplikasi tidak dapat dihapus melalui admin.
- Validasi kembali ID, versi/hash, status aktif, dan referensi di server dalam
  transaksi dengan lock yang sama seperti aktivasi/pemasangan tema.
- Periksa pemakaian template tema pada halaman dan draft. Tampilkan daftar
  penghalang serta tindakan penggantinya; jangan mengubah layout halaman diam-diam.
- Bersihkan semua revisi paket yang dihapus, pengaturan khusus paket, dan pointer
  pemulihan yang relevan. Pertahankan pengaturan inti dan konten pengguna.
- Tentukan perlakuan referensi historis secara eksplisit: simpan metadata riwayat,
  dan jelaskan ketika pemulihan memerlukan paket yang sudah dihapus.
- Pastikan tema rusak tetap terlihat sebagai paket bermasalah yang bisa dihapus;
  daftar tema tidak boleh hanya menyembunyikannya saat validasi gagal.

### Plugin

- Gunakan alur uninstall yang sudah ada; pertahankan kewajiban nonaktif terlebih dahulu.
- Lengkapi pemeriksaan penggunaan pada widget, template halaman, rancangan,
  konfigurasi tema, dan versi pemulihan yang relevan.
- Perjelas UI tentang pengaturan paket yang ikut dihapus serta referensi yang
  menghalangi uninstall. Penghapusan riwayat pemulihan memerlukan pilihan eksplisit.
- Uji penolakan terhadap tab usang, hak akses yang dicabut, dan aktivasi bersamaan
  dengan penghapusan.

Selesai ketika admin dapat menghapus paket tidak aktif yang tidak digunakan,
sedangkan paket aktif atau masih digunakan ditolak dengan alasan yang bisa ditindaklanjuti.

## Tahap 3 — Siapkan kontrak rilis GitHub

- Tetapkan `owner/repository` resmi melalui konfigurasi instalasi. Kredensial
  untuk repositori privat, bila diperlukan, hanya disimpan di server.
- Gunakan versi semantik dan GitHub Release stabil sebagai sumber pembaruan.
  Push perubahan pengembangan belum otomatis menjadi pembaruan untuk semua situs;
  penerbitan Release menandai versi yang siap digunakan.
- Setiap rilis memuat versi, tag/commit tujuan, catatan perubahan, persyaratan
  Node/pengelola paket, informasi migrasi, paket distribusi, dan checksum SHA-256.
- Siapkan workflow pengujian dan pembuatan paket rilis. Paket tidak memuat `.env`,
  kredensial, backup database, data lokal, atau hasil pengujian privat.
- Dokumentasikan pemisahan core NextPress dari data serta kustomisasi instalasi,
  supaya pembaruan tidak menimpa perubahan pengguna tanpa pemberitahuan.

## Tahap 4 — Halaman Pembaruan NextPress

- Tambahkan `Dasbor → Pembaruan`, dengan versi terpasang, versi stabil terbaru,
  catatan rilis, waktu pemeriksaan, dan status kompatibilitas.
- Sediakan Cek pembaruan dan Perbarui NextPress. Cek otomatis berkala menggunakan
  cache; kegagalan GitHub tidak boleh menggagalkan halaman admin atau situs publik.
- Tombol pembaruan hanya aktif bila versi lebih baru, kompatibel, dan metode
  pemasangan telah dikonfigurasi. Status belum dikonfigurasi menjelaskan langkah
  penyiapan yang diperlukan.
- Hak pembaruan diperiksa di server, terpisah dari akses baca dashboard. Endpoint
  tidak menerima URL unduhan atau perintah shell bebas dari browser.
- Catat pekerjaan pembaruan secara persisten dan cegah pekerjaan ganda. Tampilkan
  tahap persiapan, backup, pemasangan, migrasi, pemeriksaan kesehatan, dan hasil.

## Tahap 5 — Pemasangan sesuai lingkungan hosting

Pemilihan adapter perlu mengikuti lingkungan instalasi; proses HTTP Next.js tidak
dijadikan tempat menjalankan update panjang atau menimpa build yang sedang melayani pengguna.

### Server/VPS yang dikelola sendiri

- Worker/CLI mengambil pekerjaan pembaruan dan memverifikasi sumber serta checksum.
- Periksa versi dasar, ruang disk, izin filesystem, runtime, akses database,
  perubahan source lokal, dan kemampuan restart sebelum melakukan perubahan.
- Siapkan versi baru pada direktori rilis terpisah. Pasang dependency dari lockfile
  dan build tanpa menyentuh direktori aplikasi yang sedang berjalan.
- Buat backup database yang terverifikasi, jalankan migrasi yang kompatibel, lalu
  alihkan aplikasi dan restart melalui konfigurasi deployment yang sudah ditetapkan operator.
- Lakukan health check. Kembalikan kode ke versi sebelumnya bila memungkinkan;
  jangan otomatis menganggap rollback kode juga membatalkan migrasi database.
- Dokumentasikan recovery database dan pembaruan yang memerlukan maintenance.

### Hosting dengan deployment terkelola/serverless

- Gunakan adapter deployment atau workflow GitHub dengan target rilis yang terikat
  ke tag/commit terverifikasi. Webhook generic yang hanya mengambil branch terbaru
  tidak cukup untuk menjamin versi yang dipilih pengguna.
- Jalankan backup dan migrasi pada proses deployment yang sesuai dengan hosting.
- Tunggu status deployment dan pemeriksaan versi aplikasi yang benar-benar aktif.
  Respons bahwa deployment diterima belum berarti update berhasil dipasang.

## Pengujian penerimaan

- Instalasi baru dan upgrade dari database lama tetap berjalan.
- Konten, menu, footer, media, akun, tema, dan plugin yang valid tetap tersimpan.
- Paket aktif, paket yang dirujuk, dan paket dengan versi usang tidak dapat dihapus
  dengan permintaan yang melewati pemeriksaan server.
- Uji versi sama/lebih lama, prerelease, rilis tidak kompatibel, manifest tidak
  valid, checksum gagal, GitHub tidak tersedia, dan batas permintaan API.
- Uji backup gagal, build gagal, migrasi gagal, restart gagal, health check gagal,
  proses terputus, retry, dan klik update bersamaan.
- Pengguna tanpa izin tidak dapat memulai update, menghapus paket, atau membaca
  kredensial/log sensitif.
- Jalankan pemeriksaan tipe, lint, build, dan uji browser; tambahkan pengujian
  otomatis untuk aturan penghapusan dan state pekerjaan update.

## Urutan pelaksanaan dan hal yang belum ditentukan

Urutan: audit/pembersihan → penghapusan paket → kontrak rilis → halaman update →
adapter deployment → uji upgrade dan recovery.

Sebelum menghubungkan pembaruan nyata, tentukan repositori GitHub resmi, status
publik/privatnya, serta hosting instalasi pertama (VPS, container, atau layanan
deployment terkelola). Rincian API provider diverifikasi dari dokumentasi resminya
saat adapter dipilih. Rencana ini belum melakukan push GitHub, menerbitkan rilis,
menghapus paket/data, atau memasang pembaruan aplikasi.
