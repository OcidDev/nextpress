import type { ReactNode } from 'react'
import { getAppearance } from '@/lib/db/queries/appearance'
import { PostContent } from '@/components/post/PostContent'
import { PostShare } from '@/components/post/PostShare'
import { PostAuthorBox } from '@/components/post/article/PostAuthorBox'
import { PostComments } from '@/components/post/article/PostComments'
import { PostCover } from '@/components/post/article/PostCover'
import { PostMeta } from '@/components/post/article/PostMeta'
import { PostTitle } from '@/components/post/article/PostTitle'
import { PostToc } from '@/components/post/article/PostToc'
import { RelatedPosts } from '@/components/post/article/RelatedPosts'
import { defineBlock, type BlockHelpers } from '../render'
import { blockPropsSchemas } from '../schemas'

/**
 * Blok artikel.
 *
 * Setiap blok membungkus satu komponen yang sudah dipakai `ArticleContent`, jadi
 * markup halaman artikel dan markup template tidak dapat menyimpang: keduanya
 * merender komponen yang sama dengan props yang sama.
 *
 * **Blok yang mengikuti sakelar Tampilan.** Foto unggulan, daftar isi, tombol
 * berbagi, metadata, dan komentar hanya dirender bila admin menyalakannya di
 * pengaturan Tampilan — sama seperti halaman biasa. Template menentukan **urutan
 * dan keberadaan** blok (blok yang tidak ditulis tidak tampil), bukan menyalakan
 * yang sudah dimatikan admin. Tanpa aturan ini, satu template dapat diam-diam
 * membatalkan pilihan admin.
 *
 * Blok yang konteks artikelnya tidak ada (mis. template `index` dipakai di halaman
 * kategori) merender `null` — itu bukan galat.
 */

/**
 * Konfigurasi tampilan yang berlaku. Sama seperti `PostList` dan `ArticleContent`,
 * blok boleh memakai `getAppearance()` bila konteks tidak membawanya; fungsinya
 * sudah di-cache per request sehingga tidak menambah query.
 */
async function configFor(helpers: BlockHelpers) {
  return helpers.context.appearance ?? (await getAppearance())
}

export const postTitleBlock = defineBlock({
  name: 'core/post-title',
  props: blockPropsSchemas['core/post-title'],
  render: (props, { context }) =>
    context.post || context.page ? (
      <PostTitle title={context.post?.title ?? context.page!.title} level={props.level} />
    ) : null,
})

export const postMetaBlock = defineBlock({
  name: 'core/post-meta',
  props: blockPropsSchemas['core/post-meta'],
  render: async (props, helpers) => {
    const post = helpers.context.post
    if (!post) return null
    const config = await configFor(helpers)
    if (!config.article.metadata) return null
    return (
      <PostMeta
        post={post.post}
        shareUrl={post.shareUrl}
        appearance={config}
        preview={helpers.context.preview}
        showAuthor={props.showAuthor}
        showDate={props.showDate}
      />
    )
  },
})

export const postFeaturedImageBlock = defineBlock({
  name: 'core/post-featured-image',
  props: blockPropsSchemas['core/post-featured-image'],
  render: async (props, helpers) => {
    const post = helpers.context.post
    if (!post) return null
    const config = await configFor(helpers)
    if (!config.article.cover) return null
    return <PostCover post={post.post} aspectRatio={props.aspectRatio} />
  },
})

export const postContentBlock = defineBlock({
  name: 'core/post-content',
  props: blockPropsSchemas['core/post-content'],
  render: (_props, { context }) =>
    context.post || context.page ? (
      <PostContent html={context.post?.content.html ?? context.page!.content} />
    ) : null,
})

export const postTocBlock = defineBlock({
  name: 'core/post-toc',
  props: blockPropsSchemas['core/post-toc'],
  render: async (props, helpers) => {
    const post = helpers.context.post
    if (!post) return null
    const config = await configFor(helpers)
    if (!config.article.toc) return null
    return <PostToc headings={post.content.headings} open={props.open} title={props.title} />
  },
})

export const postShareBlock = defineBlock({
  name: 'core/post-share',
  props: blockPropsSchemas['core/post-share'],
  render: async (_props, helpers) => {
    const post = helpers.context.post
    if (!post || helpers.context.preview) return null
    const config = await configFor(helpers)
    if (!config.article.share) return null
    return <PostShare title={post.post.title} url={post.shareUrl} />
  },
})

export const postAuthorBlock = defineBlock({
  name: 'core/post-author',
  props: blockPropsSchemas['core/post-author'],
  render: (props, { context }): ReactNode =>
    context.post ? <PostAuthorBox post={context.post.post} showBio={props.showBio} /> : null,
})

export const relatedPostsBlock = defineBlock({
  name: 'core/related-posts',
  props: blockPropsSchemas['core/related-posts'],
  render: (props, { context }) =>
    context.post ? <RelatedPosts items={context.post.related.items} limit={props.limit} /> : null,
})

export const commentsBlock = defineBlock({
  name: 'core/comments',
  props: blockPropsSchemas['core/comments'],
  render: async (_props, helpers) => {
    const post = helpers.context.post
    if (!post) return null
    const config = await configFor(helpers)
    return <PostComments post={post.post} appearance={config} preview={helpers.context.preview} />
  },
})
