import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { contentRevisions } from '@/lib/db/schema'
import { adminPage, adminPost } from '@/lib/db/queries/admin-content'
import { getSettings } from '@/lib/db/queries/settings'
import { PostContent } from '@/components/post/PostContent'
import { cleanHtml } from '@/lib/content/sanitize'
import { RestoreRevisionForm } from './RestoreRevisionForm'

export async function ContentHistory({
  kind,
  id,
  selected,
}: {
  kind: 'posts' | 'pages'
  id: string
  selected?: string
}) {
  const current = kind === 'posts' ? await adminPost(id) : await adminPage(id)
  if (!current || current.status === 'trash') notFound()
  const revisions = await getDb()
    .select()
    .from(contentRevisions)
    .where(and(eq(contentRevisions.kind, kind), eq(contentRevisions.contentId, id)))
    .orderBy(desc(contentRevisions.createdAt), desc(contentRevisions.id))
    .limit(50)
  const revision = selected ? revisions.find((row) => row.id === selected) : revisions[0]
  if (selected && !revision) notFound()
  const settings = await getSettings()
  const format = (date: Date) =>
    new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: settings.timezone,
    }).format(date)
  return (
    <>
      <Link href={`/admin/${kind}/${id}`}>← Kembali ke editor</Link>
      <h1>Riwayat revisi: {current.title}</h1>
      <p>
        Menampilkan hingga 50 revisi terbaru. Pemulihan mengembalikan judul, isi, dan atribut
        konten. URL, status publikasi, dan SEO tetap mengikuti versi sekarang.
      </p>
      {!revisions.length && <p>Belum ada revisi. Riwayat mulai dicatat saat konten disimpan.</p>}
      <div className="adminHistoryLayout">
        <nav aria-label="Daftar revisi" className="adminEditorPanel">
          {revisions.map((row) => (
            <p key={row.id}>
              <Link
                href={`/admin/${kind}/${id}/history?revision=${row.id}`}
                aria-current={row.id === revision?.id ? 'page' : undefined}
              >
                {format(row.createdAt)} — {String(row.snapshot.title)}
              </Link>
            </p>
          ))}
        </nav>
        {revision && (
          <section className="adminEditorPanel">
            <h2>{String(revision.snapshot.title)}</h2>
            <p>{format(revision.createdAt)}</p>
            <RestoreRevisionForm
              kind={kind}
              id={id}
              revision={revision.id}
              version={
                current.updatedAt?.toISOString() ||
                ('publishedAt' in current ? current.publishedAt.toISOString() : '')
              }
              published={current.status === 'published'}
            />
            <PostContent html={cleanHtml(String(revision.snapshot.content || ''))} />
          </section>
        )}
      </div>
    </>
  )
}
