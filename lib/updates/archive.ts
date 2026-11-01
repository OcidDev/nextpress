import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ReleaseManifest } from './manifest'
import { unsafeReleasePaths } from '../../scripts/release-files.mjs'
import { downloadAsset } from './download'

const maxArchiveBytes = 64 * 1024 * 1024
const maxExpandedBytes = 256 * 1024 * 1024
type ArchiveFile = { path: string; data: Buffer; executable: boolean }

function field(buffer: Buffer, start: number, size: number) {
  return buffer
    .subarray(start, start + size)
    .toString('utf8')
    .split('\0')[0]!
}
function octal(buffer: Buffer, start: number, size: number) {
  const value = field(buffer, start, size).trim()
  if (!/^[0-7]+$/.test(value)) throw new Error('Header arsip tidak valid.')
  return Number.parseInt(value, 8)
}
function safePath(path: string) {
  if (!path || path.length > 1024 || /[\\\x00-\x1f\x7f]/.test(path)) return false
  const parts = path.replace(/\/$/, '').split('/')
  return (
    parts.every((part) => part && part !== '.' && part !== '..' && part !== '.git') &&
    unsafeReleasePaths([path]).length === 0
  )
}
function pax(buffer: Buffer) {
  const values = new Map<string, string>()
  let offset = 0
  while (offset < buffer.length) {
    const space = buffer.indexOf(32, offset)
    const rawSize = buffer.subarray(offset, space).toString('ascii')
    if (space < offset || !/^\d+$/.test(rawSize)) throw new Error('Metadata arsip tidak valid.')
    const size = Number(rawSize)
    if (
      size <= space - offset + 2 ||
      offset + size > buffer.length ||
      buffer[offset + size - 1] !== 10
    )
      throw new Error('Metadata arsip tidak valid.')
    const record = buffer.subarray(space + 1, offset + size - 1).toString('utf8')
    const eq = record.indexOf('=')
    if (eq < 1) throw new Error('Metadata arsip tidak valid.')
    values.set(record.slice(0, eq), record.slice(eq + 1))
    offset += size
  }
  return values
}

/** Deliberately accepts only the files/directories and PAX metadata emitted by git archive.
 * No links, devices, ownership, permissions from the archive, or tar subprocess extraction. */
export function readReleaseArchive(compressed: Buffer, manifest: ReleaseManifest): ArchiveFile[] {
  if (manifest.source.bytes > maxArchiveBytes || compressed.length !== manifest.source.bytes)
    throw new Error('Ukuran arsip rilis tidak cocok.')
  if (createHash('sha256').update(compressed).digest('hex') !== manifest.source.sha256)
    throw new Error('Checksum arsip rilis tidak cocok.')
  const tar = gunzipSync(compressed, { maxOutputLength: maxExpandedBytes })
  const files: ArchiveFile[] = []
  const seen = new Set<string>()
  let pendingPath: string | undefined
  let commit: string | undefined
  let ended = false
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) {
      if (!tar.subarray(offset).every((byte) => byte === 0))
        throw new Error('Data setelah akhir arsip.')
      ended = true
      break
    }
    const expected = octal(header, 148, 8)
    const actual = header.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0)
    if (actual !== expected) throw new Error('Checksum header arsip tidak cocok.')
    const size = octal(header, 124, 12)
    const type = header[156]
    const start = offset + 512
    if (!Number.isSafeInteger(size) || start + size > tar.length)
      throw new Error('Arsip terpotong.')
    const data = tar.subarray(start, start + size)
    offset = start + Math.ceil(size / 512) * 512
    if (type === 103 || type === 120) {
      const metadata = pax(data)
      for (const key of metadata.keys())
        if (!['path', 'comment', 'mtime', 'atime', 'ctime'].includes(key))
          throw new Error('Metadata arsip tidak didukung.')
      if (type === 103) {
        if (metadata.has('path')) throw new Error('Path global tidak diizinkan.')
        if (metadata.has('comment')) commit = metadata.get('comment')
      } else {
        if (pendingPath) throw new Error('Metadata path ganda.')
        pendingPath = metadata.get('path')
      }
      continue
    }
    const prefix = field(header, 345, 155)
    const path = pendingPath ?? `${prefix ? `${prefix}/` : ''}${field(header, 0, 100)}`
    pendingPath = undefined
    if (!safePath(path) || seen.has(path.replace(/\/$/, '')))
      throw new Error('Path arsip tidak aman atau duplikat.')
    seen.add(path.replace(/\/$/, ''))
    if (seen.size > 10_000) throw new Error('Terlalu banyak berkas arsip.')
    if (type === 53 && size === 0) continue
    if (type !== 48 && type !== 0)
      throw new Error('Arsip hanya boleh berisi berkas biasa dan direktori.')
    files.push({ path, data, executable: Boolean(octal(header, 100, 8) & 0o111) })
  }
  if (!ended || pendingPath || commit !== manifest.commit)
    throw new Error('Identitas commit arsip tidak cocok.')
  const packageFile = files.find((file) => file.path === 'package.json')
  const app = packageFile && JSON.parse(packageFile.data.toString('utf8'))
  if (
    app?.name !== 'nextpress' ||
    app.version !== manifest.version ||
    app.packageManager !== manifest.requirements.packageManager
  )
    throw new Error('Identitas paket rilis tidak cocok.')
  if (
    !files.some((file) => file.path === 'LICENSE') ||
    !files.some((file) => file.path === 'pnpm-lock.yaml')
  )
    throw new Error('Paket rilis tidak lengkap.')
  return files
}

export async function downloadReleaseArchive(manifest: ReleaseManifest) {
  if (manifest.source.bytes > maxArchiveBytes) throw new Error('Arsip rilis terlalu besar.')
  const data = await downloadAsset(manifest.source.archive, manifest.source.bytes)
  return readReleaseArchive(data, manifest)
}

/** Destination must be a newly-created private staging directory. */
export async function writeReleaseFiles(directory: string, files: ArchiveFile[]) {
  for (const file of files) {
    const destination = join(directory, file.path)
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
    await writeFile(destination, file.data, { flag: 'wx', mode: file.executable ? 0o700 : 0o600 })
  }
}
