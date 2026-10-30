# Batas inti NextPress, tema, dan plugin

## Inti NextPress

Inti memiliki autentikasi/kapabilitas, pengelolaan paket, editor, pratinjau,
penyimpanan rancangan, penerapan, penghapusan, dan pemulihan. Pengaturan `site`
(identitas, logo, menu, footer, tautan sosial) tetap tersedia bagi setiap tema dan
bertahan ketika tema diganti atau dihapus. Tombol Sesuaikan membuka editor inti
untuk setiap paket valid, termasuk tema tanpa kontrol desain tambahan.

## Tema

Paket tema memiliki template, bagian template, aset, `style.css`, `theme.json`,
dan kontrol desain opsional dalam `customizer.json`. CSS tema harus memakai
variabel `--theme--custom--<id>` untuk setiap kontrol yang disediakan. Nilai
rancangan dan aktif disimpan per tema dalam `theme:<id>:customization`.
Paket tema eksternal didistribusikan dan dipasang terpisah dari sumber inti.
Warna, font, ukuran, serta aset khusus tema tetap berada di paket tersebut.
Inti menyediakan kontrak editor dan penyimpanan tanpa bergantung pada nama tema.

## Plugin

Plugin tetap memakai manifest, konfigurasi, aktivasi, dan penghapusannya sendiri.
Tema boleh menyediakan slot widget melalui API inti, tetapi tidak mengaktifkan,
menghapus, atau menyimpan ulang konfigurasi plugin saat disesuaikan/dihapus.

## Penghapusan dan pemulihan

Penghapusan membutuhkan `delete_themes`, memeriksa revisi terbaru, dan memakai
lock yang sama dengan pemasangan/aktivasi. Tema yang sedang melayani situs tidak
boleh dihapus. Referensi template halaman, termasuk draf dan Sampah, harus
pindah terlebih dahulu. Semua versi paket dan pengaturan desain tema dihapus
bersama; data situs, halaman, media, dan plugin dipertahankan.

Tema bawaan nonaktif juga bisa dihapus dari daftar instalasi. Penanda
`theme:<id>:uninstalled` mencegah paket bawaan muncul lagi setelah refresh atau
pembaruan inti. Memasang ZIP tema tersebut kembali menghapus penanda itu.
Salinan `core-default` tetap dibawa oleh program untuk pemulihan internal jika
tema aktif dan tema sebelumnya tidak dapat digunakan. Salinan ini tidak masuk
kembali ke daftar tema kecuali sedang diperlukan untuk melayani situs.

## Sumber inti dan instalasi pengujian

Repository NextPress adalah sumber inti CMS. Instalasi pengujian memakai
repository atau direktori terpisah untuk mencoba paket tema dan plugin.
Perbaikan inti dikembangkan di sumber NextPress lalu diuji pada instalasi itu.
Paket eksternal, konfigurasi lingkungan, database, dan data pengujian tidak
boleh disalin ke repository inti.

Uji terkait: `pnpm test:themes`. Pengujian membuat skema PostgreSQL sementara
dan menghapus hanya skema miliknya sendiri.
