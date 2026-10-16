import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { zipSync } from 'fflate'
import { validateThemePackage, type ThemeFiles } from '../lib/themes/package'

// Tema bawaan dibangun dari folder di examples/themes.
//
// Daftar ini sengaja eksplisit, bukan "semua folder yang ada": examples/themes
// juga memuat tema contoh (mis. `starter`) yang hanya dipakai pratinjau template
// dan tidak boleh ikut terpasang sebagai tema di galeri admin.
const ids = ['core-default']

const source = path.resolve('examples/themes')
// Menghapus tema bawaan dari daftar di atas akan menulis bundled.generated.json
// tanpa satu pun tema, dan situs kehilangan tampilannya. Gagal sebelum menulis.
if (!ids.length) throw new Error('Daftar tema bawaan kosong. bundled.generated.json tidak diubah.')
for (const id of ids) {
  if (await readdir(path.join(source, id)).catch(() => null)) continue
  throw new Error(
    `Sumber tema "${id}" tidak ada di ${path.join(source, id)}. ` +
      'bundled.generated.json tidak diubah agar tema bawaan tidak hilang.',
  )
}

const packages: Record<string, ThemeFiles> = {}
for (const id of ids) {
  const directory = path.join(source, id)
  const files: ThemeFiles = {}
  async function walk(relative = '') {
    for (const entry of (
      await readdir(path.join(directory, relative), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(name)
      else files[name] = (await readFile(path.join(directory, name))).toString('base64')
    }
  }
  await walk()
  const theme = validateThemePackage(files)
  packages[id] = files
  const archive = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        [new Uint8Array(Buffer.from(bytes, 'base64')), { mtime: new Date('2026-01-01T00:00:00Z') }],
      ]),
    ),
    { level: 9 },
  )
  await mkdir('public/themes', { recursive: true })
  await writeFile(`public/themes/${id}.zip`, archive)
  console.log(`${id}: ${archive.length} bytes, sha256 ${theme.hash}`)
}
await writeFile('lib/themes/bundled.generated.json', JSON.stringify(packages) + '\n')
