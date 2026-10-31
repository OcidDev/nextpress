# Batas inti NextPress, tema, dan plugin

## Inti NextPress

Inti memiliki autentikasi/kapabilitas, pengelolaan paket, editor, pratinjau,
penyimpanan rancangan, penerapan, penghapusan, dan pemulihan. Pengaturan `site`
(identitas, logo, menu, footer, tautan sosial) tetap tersedia bagi setiap tema dan
bertahan ketika tema diganti atau dihapus. Tombol Sesuaikan membuka editor inti
untuk setiap paket valid, termasuk tema tanpa kontrol desain tambahan.

## Tema

Paket tema memiliki template, bagian template, aset, `style.css`, `theme.json`,
dan kontrol desain opsional dalam `customizer.json`. CSS tema memakai variabel `--theme--custom--<id>` atau binding `cssProperties`
yang dideklarasikan kontrol. Panel susunan opsional berada di `layout.json`. Nilai
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

## Declarative layout packages

A theme may include `layout.json` (version 1). Its `panels` select the generic
`style`, `header`, `home`, `article`, `sidebar`, and `footer` editors. `defaults`
and optional named `presets` contain validated layout data. Packages cannot
supply JavaScript or override core identity, navigation, social links, home-page
routing, permissions, plugin configuration, or content records.

The CMS stores active, draft and previous layouts under
`theme:<id>:appearance:<state>`. Each write binds the package hash, active theme
choice and revision. Inactive themes can save private drafts; only the active
theme can publish or restore. Theme uninstall removes its own layout revisions.
Plugin uninstall checks references in all themes, including inactive drafts and
recovery revisions.

On the first lifecycle write, existing global appearance revisions are copied
once to the owning theme. The original revisions remain as a backup. They are
not inherited by another theme or resurrected after an uninstall. Site settings
are projected at read time and are never stored inside new theme revisions.

`customizer.json` can set `inheritDefaults: true` to emit only saved overrides,
so native theme styles and reader mode/palette choices remain effective.
Controls may declare validated `cssProperties` to bind a value to scoped CSS
variables consumed by their block presentation. Resetting removes these overrides.
A package defines the presentation; the CMS provides the editor, validation,
storage, reference checks, preview and lifecycle. Plugin code/configuration stay
in the plugin registry.
