import { PostList } from '@/components/blog/PostList'
import { PostPagination, paginationHref } from '@/components/blog/PostPagination'
import { defineBlock } from '../render'
import { blockPropsSchemas } from '../schemas'

/**
 * Blok daftar artikel dan paginasi.
 *
 * Datanya **tidak** diambil di sini: `context.archive.result` sudah diisi oleh
 * pembangun konteks memakai query yang sama dengan halaman arsip/beranda. Blok
 * ini hanya menentukan cara menampilkannya, dan itu pun lewat `PostList` yang
 * sudah ada.
 *
 * Pembagian tugas antara dua blok ini sengaja: `core/post-list` merender kisi
 * kartu tanpa navigasi halaman, `core/pagination` merender navigasinya. Halaman
 * arsip sekarang merender keduanya sekaligus lewat `PostList` (`paginate` bawaan
 * `true`), jadi pohon `core/post-list` + `core/pagination` menghasilkan markup
 * yang sama persis — hanya saja template boleh menaruh paginasi di tempat lain.
 */

/**
 * `limit` membatasi jumlah **kartu yang tampil**, bukan jumlah data yang diambil:
 * `total`/`totalPages` pada konteks tidak dihitung ulang, sehingga
 * `core/pagination` tetap menunjuk jumlah halaman yang sebenarnya. Saat konteks
 * membawa `feed` ("muat lagi"), `limit` diabaikan — feed memuat halaman
 * berikutnya sendiri, dan memotong halaman pertama hanya akan membuat jumlah
 * kartu berbeda di tiap halaman.
 */
export const postListBlock = defineBlock({
  name: 'core/post-list',
  props: blockPropsSchemas['core/post-list'],
  render: (props, { context }) => {
    const archive = context.archive
    if (!archive) return null
    const feed = archive.feed
    const result =
      !feed && props.limit && props.limit < archive.result.items.length
        ? { ...archive.result, items: archive.result.items.slice(0, props.limit) }
        : archive.result
    return (
      <PostList
        result={result}
        basePath={archive.basePath}
        query={archive.query}
        layout={props.layout ?? archive.layout}
        context={archive.context}
        // Feed merender tombol "muat lagi" dan menggantikan paginasi; tanpa feed,
        // navigasi halaman disediakan blok `core/pagination`.
        paginate={Boolean(feed)}
        feed={feed}
        appearance={context.appearance}
        preview={context.preview}
      />
    )
  },
})

/** Navigasi halaman untuk daftar di konteks arsip. */
export const paginationBlock = defineBlock({
  name: 'core/pagination',
  props: blockPropsSchemas['core/pagination'],
  render: (_props, { context }) => {
    const archive = context.archive
    if (!archive || archive.feed) return null
    return (
      <PostPagination
        page={archive.result.page}
        totalPages={archive.result.totalPages}
        href={paginationHref(archive)}
      />
    )
  },
})
