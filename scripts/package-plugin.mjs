import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative, dirname } from 'node:path'
import { zipSync } from 'fflate'

const source = resolve(process.argv[2] || 'examples/plugins/reading-card')
const output = resolve(process.argv[3] || 'public/plugin-examples/reading-card.zip')
const files = {}
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Symlink tidak diizinkan')
    if (entry.isDirectory()) await collect(path)
    else if (entry.isFile())
      files[relative(source, path).replaceAll('\\', '/')] = new Uint8Array(await readFile(path))
  }
}
await collect(source)
if (!files['plugin.json']) throw new Error('plugin.json tidak ditemukan pada folder plugin')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, zipSync(files, { level: 6 }))
console.log(`Paket plugin: ${relative(process.cwd(), output)}`)
