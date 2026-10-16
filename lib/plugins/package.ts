import { createHash } from 'node:crypto'
import { fromBuffer, type ZipFile, type Entry } from 'yauzl'
import { pluginManifestSchema, type PluginManifest } from './manifest'

export const MAX_PLUGIN_ARCHIVE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 4 * 1024 * 1024
const MAX_FILE_BYTES = 1024 * 1024
const MAX_ENTRIES = 64
export type PluginPackage = {
  manifest: PluginManifest
  files: Record<string, string>
  packageHash: string
}

function safeEntry(entry: Entry) {
  const name = entry.fileName
  if (
    !/^[a-zA-Z0-9_./-]+$/.test(name) ||
    name.startsWith('/') ||
    name
      .split('/')
      .some(
        (part, index, parts) =>
          part === '.' || part === '..' || (!part && index !== parts.length - 1),
      )
  )
    throw new Error('Path ZIP tidak aman')
  if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error('ZIP terenkripsi tidak didukung')
  if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
    throw new Error('Symlink tidak diizinkan dalam plugin')
  if (![0, 8].includes(entry.compressionMethod))
    throw new Error('Metode kompresi ZIP tidak didukung')
  if (entry.uncompressedSize > (name === 'plugin.json' ? 64 * 1024 : MAX_FILE_BYTES))
    throw new Error('File plugin terlalu besar')
  if (!name.endsWith('/') && !/\.(html|css|js|json|md|txt)$/i.test(name))
    throw new Error('Plugin hanya mendukung HTML, CSS, JavaScript, JSON, dan dokumentasi')
  return name
}

export async function readPluginPackage(buffer: Buffer): Promise<PluginPackage> {
  if (!buffer.length || buffer.length > MAX_PLUGIN_ARCHIVE_BYTES)
    throw new Error('Paket ZIP maksimal 2 MB')
  const files: Record<string, string> = Object.create(null)
  await new Promise<void>((resolve, reject) => {
    let archive: ZipFile | undefined
    let settled = false
    let total = 0
    const seen = new Set<string>()
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      archive?.close()
      reject(error instanceof Error ? error : new Error('Paket ZIP tidak valid'))
    }
    fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) return fail(new Error('Paket ZIP tidak valid'))
        archive = zip
        zip.on('error', fail)
        if (zip.entryCount > MAX_ENTRIES) return fail(new Error('Paket maksimal 64 entri'))
        zip.on('end', () => {
          if (!settled) {
            settled = true
            resolve()
          }
        })
        zip.on('entry', (entry: Entry) => {
          try {
            const name = safeEntry(entry)
            if (seen.has(name)) throw new Error('Nama file ZIP duplikat')
            seen.add(name)
            total += entry.uncompressedSize
            if (total > MAX_TOTAL_BYTES) throw new Error('Ukuran ekstraksi plugin maksimal 4 MB')
            if (name.endsWith('/')) {
              zip.readEntry()
              return
            }
            zip.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) return fail(new Error('File ZIP tidak dapat dibaca'))
              const chunks: Buffer[] = []
              let bytes = 0
              stream.on('error', fail)
              stream.on('data', (chunk: Buffer) => {
                bytes += chunk.length
                if (bytes > entry.uncompressedSize || bytes > MAX_FILE_BYTES) {
                  stream.destroy()
                  fail(new Error('Ukuran file ZIP tidak valid'))
                  return
                }
                chunks.push(chunk)
              })
              stream.on('end', () => {
                if (settled) return
                try {
                  if (bytes !== entry.uncompressedSize)
                    throw new Error('Ukuran file ZIP tidak cocok')
                  files[name] = new TextDecoder('utf-8', { fatal: true }).decode(
                    Buffer.concat(chunks),
                  )
                  zip.readEntry()
                } catch {
                  fail(new Error('File plugin harus berupa teks UTF-8 yang valid'))
                }
              })
            })
          } catch (error) {
            fail(error)
          }
        })
        zip.readEntry()
      },
    )
  })
  if (!files['plugin.json']) throw new Error('plugin.json harus berada di akar paket ZIP')
  let raw: unknown
  try {
    raw = JSON.parse(files['plugin.json'])
  } catch {
    throw new Error('plugin.json bukan JSON yang valid')
  }
  const manifest = pluginManifestSchema.parse(raw)
  for (const widget of manifest.widgets)
    for (const path of [widget.html, widget.css, widget.script]) {
      if (path && !Object.hasOwn(files, path))
        throw new Error(`File widget tidak ditemukan: ${path}`)
    }
  // Drizzle inspects object prototypes before encoding JSONB values.
  return {
    manifest,
    files: { ...files },
    packageHash: createHash('sha256').update(buffer).digest('hex'),
  }
}
