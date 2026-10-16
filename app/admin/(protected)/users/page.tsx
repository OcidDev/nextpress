import Link from 'next/link'
import { listedUsers, listLegacyAuthors } from '@/lib/db/queries/users'
import type { ListSearch } from '@/lib/db/queries/admin-list'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { SortableHeader } from '@/components/admin/SortableHeader'

export default async function UsersPage({ searchParams }: { searchParams: Promise<ListSearch> }) {
  const search = await searchParams
  const [result, legacyData] = await Promise.all([listedUsers(search), listLegacyAuthors(search)])

  const resetParams = new URLSearchParams()
  if (result.params.sort) resetParams.set('sort', result.params.sort)
  if (result.params.dir) resetParams.set('dir', result.params.dir)
  if (search?.lsort) resetParams.set('lsort', String(search.lsort))
  if (search?.ldir) resetParams.set('ldir', String(search.ldir))
  const resetHref = resetParams.toString()
    ? `/admin/users?${resetParams.toString()}`
    : '/admin/users'

  return (
    <>
      <div className="adminPageHeader">
        <h1>Pengguna</h1>
        <Link className="button" href="/admin/users/new">
          Tambah pengguna
        </Link>
      </div>
      <form
        action="/admin/users"
        method="get"
        className="adminFilters"
        role="search"
        aria-label="Filter pengguna"
      >
        <label>
          Cari pengguna
          <input name="q" type="search" maxLength={120} defaultValue={result.params.q} />
        </label>
        <label>
          Filter peran
          <select name="role" defaultValue={result.params.role}>
            <option value="">Semua peran</option>
            {Object.entries(result.roles).map(([name, definition]) => (
              <option key={name} value={name}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filter status
          <select name="status" defaultValue={result.params.status}>
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </label>
        {result.params.sort && <input type="hidden" name="sort" value={result.params.sort} />}
        {result.params.dir && <input type="hidden" name="dir" value={result.params.dir} />}
        {legacyData.sort && <input type="hidden" name="lsort" value={legacyData.sort} />}
        {legacyData.dir && <input type="hidden" name="ldir" value={legacyData.dir} />}
        <button className="button">Terapkan filter</button>
        <Link href={resetHref}>Reset filter</Link>
      </form>
      <div className="tableWrap">
        <table className="adminTable adminUsersTable">
          <thead>
            <tr>
              <SortableHeader
                column="name"
                label="Nama"
                basePath="/admin/users"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="asc"
              />
              <SortableHeader
                column="email"
                label="Email"
                basePath="/admin/users"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="asc"
              />
              <SortableHeader
                column="role"
                label="Peran"
                basePath="/admin/users"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="asc"
              />
              <SortableHeader
                column="status"
                label="Status"
                basePath="/admin/users"
                params={search}
                currentSort={result.params.sort}
                currentDir={result.params.dir}
                defaultDir="asc"
              />
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  {result.roles[user.role === 'admin' ? 'administrator' : user.role]?.label ??
                    user.role}
                </td>
                <td>{user.active ? 'Aktif' : 'Nonaktif'}</td>
                <td>
                  <Link href={`/admin/users/${user.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.rows.length && <p>Tidak ada pengguna yang sesuai dengan filter.</p>}
      <AdminPagination
        basePath="/admin/users"
        {...result}
        params={{
          ...result.params,
          ...(legacyData.rows.length ? { lsort: legacyData.sort, ldir: legacyData.dir } : {}),
        }}
      />

      {legacyData.rows.length > 0 && (
        <section className="adminLegacySection panel" style={{ marginTop: '32px' }}>
          <h2>Profil lama tanpa akun</h2>
          <p>
            Profil penulis warisan yang belum ditautkan ke akun login. Profil ini tetap tampil pada
            artikel lamanya.
          </p>
          <div className="tableWrap">
            <table className="adminTable">
              <thead>
                <tr>
                  <SortableHeader
                    column="name"
                    label="Nama"
                    basePath="/admin/users"
                    params={search}
                    sortKey="lsort"
                    dirKey="ldir"
                    currentSort={legacyData.sort}
                    currentDir={legacyData.dir}
                    defaultDir="asc"
                  />
                  <SortableHeader
                    column="slug"
                    label="Slug"
                    basePath="/admin/users"
                    params={search}
                    sortKey="lsort"
                    dirKey="ldir"
                    currentSort={legacyData.sort}
                    currentDir={legacyData.dir}
                    defaultDir="asc"
                  />
                  <SortableHeader
                    column="verified"
                    label="Status"
                    basePath="/admin/users"
                    params={search}
                    sortKey="lsort"
                    dirKey="ldir"
                    currentSort={legacyData.sort}
                    currentDir={legacyData.dir}
                    defaultDir="asc"
                  />
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {legacyData.rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.slug}</td>
                    <td>{p.verified ? 'Terverifikasi' : 'Biasa'}</td>
                    <td>
                      <Link href={`/admin/users/legacy/${p.id}`}>Edit profil</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
