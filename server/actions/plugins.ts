'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCapability } from '@/lib/admin'
import { bootExtensions } from '@/lib/extensions/bootstrap'
import { pluginIdSchema, type PluginActionState } from '@/lib/plugins/manifest'
import { doAction } from '@/lib/extensions/hooks'
import {
  PluginValidationError,
  installPluginData,
  replacePluginData,
  savePluginConfigData,
  togglePluginData,
  uninstallPluginData,
} from '@/lib/db/queries/plugins'

const revisionSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((revision) => Number.isSafeInteger(revision) && revision >= 1)

function failure(error: unknown): PluginActionState {
  return {
    error:
      error instanceof PluginValidationError
        ? error.message
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 'Data plugin tidak valid. Periksa ID, versi, dan pengaturannya.'
          : 'Plugin belum dapat diperbarui. Silakan coba lagi.',
  }
}

function revalidatePlugins() {
  revalidatePath('/', 'layout')
  revalidatePath('/admin', 'layout')
}

export async function installPlugin(
  _: PluginActionState,
  data: FormData,
): Promise<PluginActionState> {
  await requireCapability('install_plugins')
  try {
    const plugin = await installPluginData(data)
    revalidatePlugins()
    return { success: 'Plugin terpasang dalam keadaan nonaktif.', revision: plugin.revision }
  } catch (error) {
    return failure(error)
  }
}

export async function replacePlugin(
  _: PluginActionState,
  data: FormData,
): Promise<PluginActionState> {
  await requireCapability('install_plugins')
  try {
    const plugin = await replacePluginData(
      data,
      pluginIdSchema.parse(data.get('id')),
      revisionSchema.parse(data.get('revision')),
    )
    revalidatePlugins()
    return {
      success: 'Paket plugin diperbarui. Status dan pengaturan dipertahankan.',
      revision: plugin.revision,
    }
  } catch (error) {
    return failure(error)
  }
}

export async function togglePlugin(
  _: PluginActionState,
  data: FormData,
): Promise<PluginActionState> {
  await requireCapability('activate_plugins')
  try {
    // Hook harus terdaftar sebelum action dipicu.
  await bootExtensions()
  const enabled = z.enum(['true', 'false']).parse(data.get('enabled')) === 'true'
    const plugin = await togglePluginData(
      pluginIdSchema.parse(data.get('id')),
      enabled,
      revisionSchema.parse(data.get('revision')),
    )
    revalidatePlugins()
    // `plugin_activated` (EXT-01) hanya saat dinyalakan; pemasangan selalu
    // berakhir nonaktif sehingga tidak memicu action ini.
    if (enabled) await doAction('plugin_activated', { id: plugin.id, version: plugin.version })
    return {
      success: enabled ? 'Plugin diaktifkan.' : 'Plugin dinonaktifkan.',
      revision: plugin.revision,
    }
  } catch (error) {
    return failure(error)
  }
}

export async function savePluginConfig(
  _: PluginActionState,
  data: FormData,
): Promise<PluginActionState> {
  await requireCapability('activate_plugins')
  try {
    const plugin = await savePluginConfigData(
      pluginIdSchema.parse(data.get('id')),
      JSON.parse(String(data.get('config'))),
      revisionSchema.parse(data.get('revision')),
    )
    revalidatePlugins()
    return { success: 'Pengaturan plugin tersimpan.', revision: plugin.revision }
  } catch (error) {
    return failure(error)
  }
}

export async function uninstallPlugin(
  _: PluginActionState,
  data: FormData,
): Promise<PluginActionState> {
  await requireCapability('delete_plugins')
  try {
    await uninstallPluginData(
      pluginIdSchema.parse(data.get('id')),
      revisionSchema.parse(data.get('revision')),
      z
        .enum(['true'])
        .optional()
        .parse(data.get('discardPrevious') ?? undefined) === 'true',
    )
    revalidatePlugins()
    return { success: 'Plugin dihapus.' }
  } catch (error) {
    return failure(error)
  }
}
