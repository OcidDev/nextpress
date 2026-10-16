import { findPublicPostRoute, findPublicTaxonomyRoute } from '@/lib/content/permalink-server'
import type { Metadata } from 'next'
import { requireCapability } from '@/lib/admin'
import { getPostBySlug, getPosts, pageNumber } from '@/lib/db/queries/posts'
import { getAppearance } from '@/lib/db/queries/appearance'
import { archiveBlockContext, articleBlockContext, siteBlockContext } from '@/lib/blocks/load'
import { blockRegistry } from '@/lib/blocks/registry'
import { renderBlockTree, type BlockRenderReport } from '@/lib/blocks/render'
import type { BlockContext } from '@/lib/blocks/context'
import { readStarterParts, readStarterTemplate } from '@/lib/themes/starter-files'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Pratinjau template',
  robots: { index: false, follow: false },
}

/**
 * Pratinjau template tema (sprint EXT-03).
 *
 * Merender pohon blok dari tema contoh dengan data yang sama seperti halaman
 * aslinya, supaya admin dapat memeriksa hasilnya sebelum paket tema dipasang
 * (EXT-05). Dijaga `requireCapability` dan ditandai `noindex`, sama seperti pratinjau
 * Tampilan di `/preview/appearance`.
 *
 * Halaman ini juga yang membuktikan kriteria EXT-03 bahwa blok tak dikenal, props
 * cacat, dan pohon terlalu dalam **tidak** menjatuhkan render: laporan dari
 * renderer ditampilkan sebagai catatan, sementara sisa template tetap tampil.
 */

/**
 * Jalur yang dapat dipratinjau. Hanya menerima jalur absolut biasa; apa pun yang
 * diawali garis miring ganda, mengandung backslash, atau mengandung karakter
 * kendali dianggap `/`, supaya nilai dari query tidak menjadi jalur yang aneh saat
 * diurai `new URL`.
 */
function safePath(raw: string | undefined) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/'
  const hasControl = [...raw].some((char) => {
    const code = char.codePointAt(0) ?? 0
    return code < 0x20 || code === 0x7f
  })
  return hasControl ? '/' : raw
}

/**
 * Menyusun konteks blok untuk satu jalur situs.
 *
 * Query-nya sama persis dengan yang dipakai halaman aslinya, jadi pratinjau tidak
 * dapat menampilkan data yang berbeda dari halaman publik.
 */
async function contextForPath(rawPath: string): Promise<BlockContext> {
  const url = new URL(rawPath, 'http://preview.local')
  const path = url.pathname
  const page = pageNumber(url.searchParams.get('page'))
  const articleRoute = await findPublicPostRoute(
    path + (url.searchParams.has('p') ? `?p=${url.searchParams.get('p')}` : ''),
  )
  if (articleRoute) {
    const post = await getPostBySlug(articleRoute.slug)
    return post ? articleBlockContext(post, { preview: true }) : siteBlockContext({ preview: true })
  }
  const term = await findPublicTaxonomyRoute(path)
  if (term?.kind === 'tag') {
    const result = await getPosts({ tag: term.slug, page })
    return archiveBlockContext({ result, basePath: path, preview: true })
  }
  if (term?.kind === 'category') {
    const slug = term.slug
    const result = await getPosts({ categorySlug: slug, page })
    return archiveBlockContext({ result, basePath: path, preview: true })
  }
  if (path.startsWith('/author/')) {
    const slug = path.slice('/author/'.length)
    const result = await getPosts({ authorSlug: slug, page })
    return archiveBlockContext({ result, basePath: `/author/${slug}`, preview: true })
  }
  if (path === '/search' || path.startsWith('/archive')) {
    const query = url.searchParams.get('q') || undefined
    const year = /^\/archive\/\d{4}$/.test(path)
      ? Number(path.slice('/archive/'.length))
      : undefined
    const result = await getPosts({ query, year, page })
    return archiveBlockContext({ result, basePath: path, query, preview: true })
  }
  // Beranda dan sisa jalur memakai daftar artikel halaman pertama — cukup untuk
  // memeriksa tata letak daftar tanpa meniru seluruh logika bagian beranda.
  const result = await getPosts({ page })
  return archiveBlockContext({ result, basePath: path, context: 'home', preview: true })
}

/** Catatan render; hanya yang bukan "semuanya normal". */
function reportNotes(report: BlockRenderReport) {
  const notes: string[] = []
  if (report.unknown.length)
    notes.push(`Blok tak dikenal (dirender kosong): ${[...new Set(report.unknown)].join(', ')}`)
  if (report.invalid.length)
    notes.push(`Props cacat (dirender kosong): ${[...new Set(report.invalid)].join(', ')}`)
  if (report.unresolved.length)
    notes.push(`Part tidak dapat diselesaikan: ${[...new Set(report.unresolved)].join(', ')}`)
  if (report.truncated.length)
    notes.push(`Dipotong oleh batas kedalaman/jumlah node: ${report.truncated.length} node`)
  return notes
}

function NoticePanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="panel" role="alert">
      <h1>{title}</h1>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export default async function TemplatePreview({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<{ path?: string }>
}) {
  await requireCapability('edit_theme_options')
  const [name, search, appearance] = await Promise.all([
    params.then((value) => value.name),
    searchParams,
    getAppearance(),
  ])
  const path = safePath(search.path)

  const [template, parts] = await Promise.all([readStarterTemplate(name), readStarterParts()])
  const issues = template.nodes
    ? []
    : template.issues.length
      ? template.issues.map((issue) => `${issue.path}: ${issue.message}`)
      : ['template tidak dapat dibaca']

  const rendered = template.nodes
    ? await renderBlockTree(template.nodes, {
        context: await contextForPath(path),
        registry: blockRegistry,
        parts,
      })
    : null
  const notes = rendered ? reportNotes(rendered.report) : []

  const init = `document.documentElement.dataset.mode=${JSON.stringify(appearance.site.defaultMode)};document.documentElement.dataset.theme=${JSON.stringify(appearance.site.defaultTheme)};`
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: init }} />
      <div className="previewNotice">
        Pratinjau template · {name} · {path}
      </div>
      <div
        className="themeSite"
        data-width={appearance.style.width}
        data-font-size={appearance.style.fontSize}
        data-design={appearance.style.design}
      >
        {rendered ? (
          <>
            {notes.length > 0 && <NoticePanel title="Catatan render" items={notes} />}
            {rendered.content}
          </>
        ) : (
          <NoticePanel title={`Template ${name} tidak dapat dirender`} items={issues} />
        )}
      </div>
    </>
  )
}
