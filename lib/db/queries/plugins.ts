import 'server-only'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { requireCapability } from '@/lib/admin'
import { getDb, hasDatabase } from '@/lib/db'
import { plugins, options } from '@/lib/db/schema'
import { withOptionsTransaction } from '@/lib/core/options-server'
import {
  defaultPluginConfig,
  migratePluginConfig,
  parsePluginConfig,
  pluginIdSchema,
  pluginManifestSchema,
  type PluginChoice,
  type PluginConfig,
  type PluginManifest,
} from '@/lib/plugins/manifest'
import { MAX_PLUGIN_ARCHIVE_BYTES, readPluginPackage } from '@/lib/plugins/package'

type PluginTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

export class PluginValidationError extends Error {}

export type InstalledPlugin = {
  id: string
  manifest: PluginManifest
  config: PluginConfig
  packageHash: string
  enabled: boolean
  revision: number
  uploadedBy: string | null
  installedAt: string
  updatedAt: string
}
export type PublicPlugin = Pick<
  InstalledPlugin,
  'id' | 'manifest' | 'config' | 'packageHash' | 'enabled' | 'revision'
>
export type RenderablePlugin = PublicPlugin & { files: Record<string, string> }

const publicSelection = {
  id: plugins.id,
  manifest: plugins.manifest,
  config: plugins.config,
  packageHash: plugins.packageHash,
  enabled: plugins.enabled,
  revision: plugins.revision,
}
const adminSelection = {
  ...publicSelection,
  uploadedBy: plugins.uploadedBy,
  installedAt: plugins.installedAt,
  updatedAt: plugins.updatedAt,
}

function readConfig(manifest: PluginManifest, value: unknown) {
  try {
    return parsePluginConfig(manifest, value)
  } catch {
    throw new PluginValidationError(
      'Pengaturan atau penempatan tidak sesuai plugin. Periksa tipe nilai dan widget yang dipilih.',
    )
  }
}

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  await requireCapability('activate_plugins')
  const rows = await getDb()
    .select(adminSelection)
    .from(plugins)
    .orderBy(desc(plugins.installedAt), plugins.id)
  return rows.map((row) => ({
    ...row,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function getPluginChoices(): Promise<PluginChoice[]> {
  await requireCapability('edit_theme_options')
  const rows = await getDb()
    .select({ id: plugins.id, manifest: plugins.manifest, enabled: plugins.enabled })
    .from(plugins)
    .orderBy(plugins.id)
  return rows.flatMap((row) => {
    const manifest = pluginManifestSchema.safeParse(row.manifest)
    return manifest.success && manifest.data.widgets.length > 0
      ? [
          {
            id: row.id,
            name: manifest.data.name,
            enabled: row.enabled,
            widgets: manifest.data.widgets,
          },
        ]
      : []
  })
}

export async function getPublicPlugins(): Promise<PublicPlugin[]> {
  if (!hasDatabase()) return []
  const rows = await getDb()
    .select(publicSelection)
    .from(plugins)
    .where(eq(plugins.enabled, true))
    .orderBy(plugins.id)
  return rows.flatMap((row) => {
    try {
      const manifest = pluginManifestSchema.parse(row.manifest)
      return [{ ...row, manifest, config: parsePluginConfig(manifest, row.config) }]
    } catch {
      return []
    }
  })
}

export async function getPluginForRender(
  id: string,
  preview = false,
): Promise<RenderablePlugin | null> {
  if (preview) await requireCapability('activate_plugins')
  if (!hasDatabase() || !pluginIdSchema.safeParse(id).success) return null
  const [row] = await getDb()
    .select({ ...publicSelection, files: plugins.files })
    .from(plugins)
    .where(preview ? eq(plugins.id, id) : and(eq(plugins.id, id), eq(plugins.enabled, true)))
    .limit(1)
  if (!row) return null
  try {
    const manifest = pluginManifestSchema.parse(row.manifest)
    return { ...row, manifest, config: parsePluginConfig(manifest, row.config) }
  } catch {
    return null
  }
}

async function uploadedPackage(data: FormData) {
  const file = data.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_PLUGIN_ARCHIVE_BYTES)
    throw new PluginValidationError('Pilih arsip ZIP plugin maksimal 2 MB.')
  try {
    return await readPluginPackage(Buffer.from(await file.arrayBuffer()))
  } catch (error) {
    throw new PluginValidationError(
      error instanceof Error ? error.message : 'Arsip ZIP plugin tidak valid.',
    )
  }
}

export async function installPluginData(data: FormData) {
  const admin = await requireCapability('install_plugins')
  const archive = await uploadedPackage(data)
  return getDb().transaction(async (tx) => {
    await lockPlugin(tx, archive.manifest.id)
    const [existing] = await tx
      .select({ id: plugins.id })
      .from(plugins)
      .where(eq(plugins.id, archive.manifest.id))
      .for('update')
    if (existing)
      throw new PluginValidationError(
        'Plugin sudah terpasang. Gunakan Ganti ZIP untuk memperbaruinya.',
      )
    await tx.insert(plugins).values({
      id: archive.manifest.id,
      manifest: archive.manifest,
      files: archive.files,
      packageHash: archive.packageHash,
      config: defaultPluginConfig(archive.manifest),
      enabled: false,
      revision: 1,
      uploadedBy: admin.user.id,
    })
    return { id: archive.manifest.id, revision: 1 }
  })
}

export async function replacePluginData(data: FormData, id: string, revision: number) {
  const admin = await requireCapability('install_plugins')
  pluginIdSchema.parse(id)
  const archive = await uploadedPackage(data)
  if (archive.manifest.id !== id)
    throw new PluginValidationError('ID di ZIP pengganti harus sama dengan plugin yang dipilih.')
  return getDb().transaction(async (tx) => {
    await lockPlugin(tx, id)
    const [current] = await tx.select().from(plugins).where(eq(plugins.id, id)).for('update')
    if (!current) throw new PluginValidationError('Plugin tidak ditemukan.')
    guardRevision(current, revision)
    let config: PluginConfig
    try {
      config = migratePluginConfig(archive.manifest, current.config)
    } catch {
      throw new PluginValidationError(
        'ZIP pengganti menghapus widget yang masih dipasang. Hapus penempatan widget itu terlebih dahulu.',
      )
    }
    if (current.enabled) await guardSeoProvider(tx, id, archive.manifest)
    const references = await pluginReferences(tx, id)
    if (
      references.some(
        (reference) => !archive.manifest.widgets.some((widget) => widget.id === reference.widgetId),
      )
    )
      throw new PluginValidationError(
        'ZIP pengganti menghapus widget yang masih digunakan di rancangan, tampilan aktif, atau versi pemulihan. Hapus penempatannya lebih dulu.',
      )
    await tx
      .update(plugins)
      .set({
        manifest: archive.manifest,
        files: archive.files,
        packageHash: archive.packageHash,
        config,
        revision: current.revision + 1,
        uploadedBy: admin.user.id,
        updatedAt: new Date(),
      })
      .where(eq(plugins.id, id))
    return { id, revision: current.revision + 1 }
  })
}

export async function togglePluginData(id: string, enabled: boolean, revision: number) {
  await requireCapability('activate_plugins')
  pluginIdSchema.parse(id)
  return getDb().transaction(async (tx) => {
    await lockPlugin(tx, id)
    const [current] = await tx.select().from(plugins).where(eq(plugins.id, id)).for('update')
    if (!current) throw new PluginValidationError('Plugin tidak ditemukan.')
    guardRevision(current, revision)
    const manifest = pluginManifestSchema.parse(current.manifest)
    if (enabled) {
      readConfig(manifest, current.config)
      await guardSeoProvider(tx, id, manifest)
    }
    await tx
      .update(plugins)
      .set({ enabled, revision: current.revision + 1, updatedAt: new Date() })
      .where(eq(plugins.id, id))
    return { id, revision: current.revision + 1, version: manifest.version }
  })
}

export async function savePluginConfigData(id: string, value: unknown, revision: number) {
  await requireCapability('activate_plugins')
  pluginIdSchema.parse(id)
  return getDb().transaction(async (tx) => {
    await lockPlugin(tx, id)
    const [current] = await tx.select().from(plugins).where(eq(plugins.id, id)).for('update')
    if (!current) throw new PluginValidationError('Plugin tidak ditemukan.')
    guardRevision(current, revision)
    const manifest = pluginManifestSchema.parse(current.manifest)
    const config = readConfig(manifest, value)
    await tx
      .update(plugins)
      .set({ config, revision: current.revision + 1, updatedAt: new Date() })
      .where(eq(plugins.id, id))
    return { id, revision: current.revision + 1 }
  })
}

export async function uninstallPluginData(id: string, revision: number, discardPrevious = false) {
  await requireCapability('delete_plugins')
  pluginIdSchema.parse(id)
  return withOptionsTransaction(async (tx, optionApi) => {
    await lockPlugin(tx, id)
    const [current] = await tx.select().from(plugins).where(eq(plugins.id, id)).for('update')
    if (!current) throw new PluginValidationError('Plugin tidak ditemukan.')
    guardRevision(current, revision)
    if (current.enabled) throw new PluginValidationError('Nonaktifkan plugin sebelum menghapusnya.')
    const references = await pluginReferences(tx, id)
    if (references.some((reference) => reference.key !== 'appearance:previous'))
      throw new PluginValidationError(
        'Plugin masih digunakan di rancangan atau tampilan aktif. Hapus bagian/widget plugin dan terapkan tampilan bersih sebelum mencoba lagi.',
      )
    if (references.some((reference) => reference.key === 'appearance:previous')) {
      if (!discardPrevious)
        throw new PluginValidationError(
          'Plugin masih digunakan oleh versi pemulihan Tampilan. Pilih Hapus versi pemulihan Tampilan yang memakai plugin ini untuk menghapus plugin beserta versi pemulihan tersebut.',
        )
      await optionApi.deleteOption('appearance:previous')
    }
    await tx.delete(plugins).where(eq(plugins.id, id))
    return { id }
  })
}

async function lockPlugin(tx: PluginTransaction, id: string) {
  // Appearance publishing and plugin changes always acquire these in this order.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cms-appearance'))`)
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'cms-plugins:' + id}))`)
}

function guardRevision(current: { revision: number }, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1 || current.revision !== revision)
    throw new PluginValidationError(
      'Plugin sudah berubah di tab lain. Muat ulang halaman sebelum menyimpan perubahan.',
    )
}

type AppearancePluginReference = { widgetId: string; enabled: boolean }
function appearanceReferences(
  value: unknown,
  pluginId: string,
  inheritedEnabled = true,
): AppearancePluginReference[] {
  if (Array.isArray(value))
    return value.flatMap((item) => appearanceReferences(item, pluginId, inheritedEnabled))
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  const enabled = inheritedEnabled && item.enabled !== false
  const direct =
    item.pluginId === pluginId
      ? [{ widgetId: typeof item.widgetId === 'string' ? item.widgetId : '', enabled }]
      : []
  return [
    ...direct,
    ...Object.values(item).flatMap((child) => appearanceReferences(child, pluginId, enabled)),
  ]
}

async function pluginReferences(tx: PluginTransaction, id: string) {
  const rows = await tx
    .select({ id: options.name, value: options.value })
    .from(options)
    .where(inArray(options.name, ['appearance:active', 'appearance:draft', 'appearance:previous']))
  return rows.flatMap((row) =>
    appearanceReferences(row.value, id).map((reference) => ({ key: row.id, ...reference })),
  )
}

async function guardSeoProvider(tx: PluginTransaction, id: string, manifest: PluginManifest) {
  if (!manifest.extensions?.contentSeo) return
  const active = await tx
    .select({ id: plugins.id, manifest: plugins.manifest })
    .from(plugins)
    .where(eq(plugins.enabled, true))
  if (active.some((plugin) => plugin.id !== id && plugin.manifest.extensions?.contentSeo))
    throw new PluginValidationError(
      'Nonaktifkan plugin SEO yang sedang aktif sebelum mengaktifkan penyedia SEO lain.',
    )
}
