import { MAX_THEME_ZIP_BYTES, THEME_ZIP_SIZE_MESSAGE } from './limits'
import { themeJsonCss, themeJsonSchema } from './style'
import { customizationSchema, type ThemeCustomization } from './customization'
import { createHash } from 'node:crypto'
import { fromBuffer } from 'yauzl'
import { z } from 'zod'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import {
  parseTemplate,
  templateNameSchema,
  type ThemeTemplate,
  type BlockNode,
  MAX_TEMPLATE_DEPTH,
  MAX_TEMPLATE_NODES,
} from './template'

export const themeManifestSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    apiVersion: z.literal(1).default(1),
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1).max(100),
    version: z.string().min(1).max(32),
    author: z.string().max(100).default(''),
    description: z.string().max(1000).default(''),
    screenshot: z.literal('screenshot.png').default('screenshot.png'),
    capabilities: z.array(z.string().max(60)).max(30).default([]),
  })
  .strict()
export type ThemeManifest = z.infer<typeof themeManifestSchema>
/** Binary-safe serialized package; stored in PostgreSQL, never the deployment filesystem. */
export type ThemeFiles = Record<string, string>
export type ThemePackage = {
  manifest: ThemeManifest
  files: ThemeFiles
  hash: string
  templates: Record<string, ThemeTemplate>
  parts: Record<string, ThemeTemplate>
  css: string
  customization?: ThemeCustomization
  pageTemplates: { name: string; title: string }[]
}
export { MAX_THEME_ZIP_BYTES } from './limits'
const MAX_TOTAL = 20 * 1024 * 1024
const MAX_FILE = 5 * 1024 * 1024
const safePath = (name: string) =>
  /^[a-zA-Z0-9_./-]+$/.test(name) &&
  !name.startsWith('/') &&
  !name.split('/').some((p) => p === '..' || p === '.' || !p)
export const themeAssetUrl = (id: string, hash: string, name: string) =>
  `/api/themes/${id}/${hash}/${name}`

/** Only package-local URLs and selectors contained by the theme's own root are allowed. */
export function scopeThemeCss(source: string, id: string, hash: string, files: ThemeFiles) {
  const root = postcss.parse(source)
  const scope = `[data-theme-package="${id}"]`
  root.walkAtRules((rule) => {
    if (!['media', 'supports', 'font-face'].includes(rule.name.toLowerCase()))
      throw new Error(`Aturan CSS @${rule.name} tidak didukung.`)
    if (/[\\{}<>]|url\s*\(/i.test(rule.params)) throw new Error('Parameter CSS tidak aman.')
  })
  root.walkRules((rule) => {
    rule.selector = selectorParser((selectors) => {
      selectors.each((selector) => {
        const first = selector.nodes[0]
        if (first?.type !== 'pseudo' || first.value !== ':scope')
          throw new Error('Selector style.css harus diawali :scope.')
        selector.walkCombinators((node) => {
          if (node.value.trim() && node.value.trim() !== '>')
            throw new Error('Selector CSS tidak boleh keluar dari root tema.')
        })
        selector.walk((node) => {
          if (node.type === 'pseudo' && [':global', ':host', ':host-context'].includes(node.value))
            throw new Error('Selector CSS tidak aman.')
        })
        first.replaceWith(
          selectorParser.attribute({
            attribute: 'data-theme-package',
            operator: '=',
            value: id,
            quoteMark: '"',
            raws: {},
          }),
        )
      })
    }).processSync(rule.selector)
  })
  root.walkDecls((decl) => {
    if (
      /[\\<>]/.test(decl.value) ||
      /expression\s*\(|(?:image-set|src|image)\s*\(|(?:javascript|data|https?):|\/\*|\/\//i.test(
        decl.value,
      ) ||
      /^(?:behavior|-moz-binding)$/i.test(decl.prop)
    )
      throw new Error('Nilai CSS tidak aman.')
    decl.value = decl.value.replace(
      /url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gi,
      (_all, name: string) => {
        if (!name.startsWith('assets/') || !files[name] || !safePath(name))
          throw new Error(`Aset CSS tidak ditemukan: ${name}`)
        return `url("${themeAssetUrl(id, hash, name)}")`
      },
    )
    if (
      decl.parent?.type === 'atrule' &&
      decl.parent.name === 'font-face' &&
      decl.prop === 'font-family' &&
      !decl.value.replace(/['"]/g, '').startsWith(`theme-${id}-`)
    )
      throw new Error('Nama font harus memakai prefix ID tema.')
  })
  return root.toString().replaceAll(':scope', scope)
}

export function validateThemePackage(files: ThemeFiles): ThemePackage {
  const names = Object.keys(files).sort()
  if (!names.length || names.length > 128) throw new Error('Paket tema maksimal 128 berkas.')
  let bytes = 0
  for (const name of names) {
    if (
      !safePath(name) ||
      !/^(?:theme\.manifest\.json|theme\.json|customizer\.json|screenshot\.png|style\.css|(?:templates|parts)\/[a-z0-9-]+\.json|assets\/[a-zA-Z0-9_./-]+\.(?:woff2|png|jpg|jpeg|webp|gif|txt))$/.test(
        name,
      )
    )
      throw new Error(`Berkas tema tidak didukung: ${name}`)
    const asset = Buffer.from(files[name]!, 'base64')
    const size = asset.length
    const extension = name.split('.').pop()
    const signatures: Record<string, () => boolean> = {
      png: () => asset.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      woff2: () => asset.subarray(0, 4).toString() === 'wOF2',
      webp: () =>
        asset.subarray(0, 4).toString() === 'RIFF' && asset.subarray(8, 12).toString() === 'WEBP',
      jpg: () => asset[0] === 255 && asset[1] === 216 && asset[2] === 255,
      jpeg: () => asset[0] === 255 && asset[1] === 216 && asset[2] === 255,
      gif: () => /^GIF8[79]a$/.test(asset.subarray(0, 6).toString()),
    }
    if (extension && signatures[extension] && !signatures[extension]())
      throw new Error(`Format aset tidak sesuai ekstensi: ${name}`)
    bytes += size
    if (size > MAX_FILE || bytes > MAX_TOTAL) throw new Error('Isi paket tema terlalu besar.')
  }
  const json = (name: string) => {
    if (!files[name]) throw new Error(`Paket tema wajib memiliki ${name}.`)
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(files[name]!, 'base64')),
    ) as unknown
  }
  const manifest = themeManifestSchema.parse(json('theme.manifest.json'))
  const customization = files['customizer.json']
    ? customizationSchema.parse(json('customizer.json'))
    : undefined
  const themeJson = themeJsonSchema.parse(json('theme.json'))
  const pageTemplates = themeJson.customTemplates ?? []
  if (new Set(pageTemplates.map((item) => item.name)).size !== pageTemplates.length)
    throw new Error('Nama template laman duplikat.')
  const tokens = themeJsonCss(themeJson)
  const templates: ThemePackage['templates'] = {}
  const parts: ThemePackage['parts'] = {}
  for (const name of names.filter((name) => /^(templates|parts)\//.test(name))) {
    const slug = name.split('/')[1]!.replace(/\.json$/, '')
    if (name.startsWith('templates/')) {
      if (!pageTemplates.some((item) => item.name === slug)) templateNameSchema.parse(slug)
    } else if (!/^[a-z][a-z0-9-]{0,39}$/.test(slug))
      throw new Error(`Nama part tidak valid: ${slug}`)
    const parsed = parseTemplate(json(name))
    if (!parsed.template)
      throw new Error(`${name}: ${parsed.issues.map((i) => i.message).join('; ')}`)
    ;(name.startsWith('templates/') ? templates : parts)[slug] = parsed.template
  }
  if (!templates.index) throw new Error('templates/index.json wajib tersedia.')
  for (const item of pageTemplates) {
    if (!templates[item.name]) throw new Error(`Template laman ${item.name} tidak ditemukan.`)
    if (['index', 'home', 'front-page', 'single', 'page', 'archive', '404'].includes(item.name))
      throw new Error('Template laman khusus harus memakai nama tersendiri.')
  }
  // Validate the expanded tree, including references, before storing or activating anything.
  for (const template of [...Object.values(templates), ...Object.values(parts)]) {
    let count = 0
    const walk = (nodes: BlockNode[], depth: number, chain: string[]) => {
      for (const node of nodes) {
        if (++count > MAX_TEMPLATE_NODES || depth > MAX_TEMPLATE_DEPTH)
          throw new Error('Ekspansi template melebihi batas renderer.')
        if (node.children) walk(node.children, depth + 1, chain)
        if (node.block === 'core/template-part') {
          const slug = String(node.props?.slug)
          if (!parts[slug] || chain.includes(slug))
            throw new Error(`Part hilang atau melingkar: ${slug}`)
          walk(parts[slug].blocks, depth + 1, [...chain, slug])
        }
      }
    }
    walk(template.blocks, 1, [])
  }
  const hash = createHash('sha256')
    .update(JSON.stringify(names.map((name) => [name, files[name]])))
    .digest('hex')
  const css = scopeThemeCss(
    tokens +
      '\n' +
      (files['style.css'] ? Buffer.from(files['style.css'], 'base64').toString('utf8') : ''),
    manifest.id,
    hash,
    files,
  )
  return { manifest, files, hash, templates, parts, css, customization, pageTemplates }
}

export async function readThemeZip(buffer: Buffer): Promise<ThemePackage> {
  if (!buffer.length || buffer.length > MAX_THEME_ZIP_BYTES) throw new Error(THEME_ZIP_SIZE_MESSAGE)
  const files: ThemeFiles = {}
  const seen = new Set<string>()
  let total = 0
  await new Promise<void>((resolve, reject) => {
    fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) return reject(new Error('Berkas ZIP tema tidak valid.'))
        const fail = (error: unknown) => {
          zip.close()
          reject(error)
        }
        zip.on('error', fail)
        zip.on('end', resolve)
        zip.on('entry', (entry) => {
          const name = entry.fileName.replace(/\/$/, '')
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000
          if (
            !safePath(name) ||
            seen.has(name) ||
            seen.size >= 128 ||
            entry.generalPurposeBitFlag & 1 ||
            mode === 0o120000 ||
            ![0, 8].includes(entry.compressionMethod)
          )
            return fail(
              new Error('ZIP mengandung path, duplikat, atau jenis berkas yang tidak aman.'),
            )
          seen.add(name)
          total += entry.uncompressedSize
          if (entry.uncompressedSize > MAX_FILE || total > MAX_TOTAL)
            return fail(new Error('Isi paket tema terlalu besar.'))
          if (entry.fileName.endsWith('/')) {
            zip.readEntry()
            return
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) return fail(new Error('Gagal membaca ZIP tema.'))
            const chunks: Buffer[] = []
            let size = 0
            stream.on('error', fail)
            stream.on('data', (chunk) => {
              size += chunk.length
              if (size > MAX_FILE || size > entry.uncompressedSize) {
                stream.destroy()
                fail(new Error('Ukuran berkas ZIP tidak valid.'))
                return
              }
              chunks.push(Buffer.from(chunk))
            })
            stream.on('end', () => {
              files[entry.fileName] = Buffer.concat(chunks).toString('base64')
              zip.readEntry()
            })
          })
        })
        zip.readEntry()
      },
    )
  })
  const manifests = Object.keys(files).filter((name) => /(^|\/)theme\.manifest\.json$/.test(name))
  if (manifests.length !== 1) throw new Error('ZIP harus memiliki tepat satu theme.manifest.json.')
  const prefix = manifests[0]!.slice(0, -'theme.manifest.json'.length)
  if (Object.keys(files).some((name) => !name.startsWith(prefix)))
    throw new Error('Semua berkas harus berada dalam satu direktori paket.')
  return validateThemePackage(
    Object.fromEntries(
      Object.entries(files).map(([name, contents]) => [name.slice(prefix.length), contents]),
    ),
  )
}
