/** Format tanggal ISO ke bahasa Indonesia, mis. "3 Oktober 2026". */
export function formatDate(iso: string, locale = 'id-ID'): string {
  return new Date(iso).toLocaleDateString(locale, {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Slug aman untuk URL: huruf kecil, tanpa diakritik, spasi jadi tanda hubung. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

