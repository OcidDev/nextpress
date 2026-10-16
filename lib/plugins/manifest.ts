import { z } from 'zod'
import { pluginPageTemplateSchema } from '@/lib/themes/page-template-schema'

export const pluginIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const key = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-zA-Z0-9_]*$/)
  .refine((value) => !['constructor', 'prototype', '__proto__'].includes(value))
const path = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-z]+$/)
const commonField = {
  key,
  label: z.string().trim().min(1).max(100),
  description: z.string().max(300).optional(),
}
export const pluginSettingSchema = z.discriminatedUnion('type', [
  z.object({ ...commonField, type: z.literal('text'), default: z.string().max(1000) }).strict(),
  z
    .object({ ...commonField, type: z.literal('textarea'), default: z.string().max(10000) })
    .strict(),
  z
    .object({
      ...commonField,
      type: z.literal('color'),
      default: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .strict(),
  z.object({ ...commonField, type: z.literal('boolean'), default: z.boolean() }).strict(),
  z
    .object({
      ...commonField,
      type: z.literal('number'),
      default: z.number().finite(),
      min: z.number().finite().optional(),
      max: z.number().finite().optional(),
    })
    .strict(),
])
export const pluginManifestSchema = z
  .object({
    apiVersion: z.union([z.literal(1), z.literal(2)]),
    id: pluginIdSchema,
    name: z.string().trim().min(1).max(100),
    version: z
      .string()
      .max(40)
      .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
    description: z.string().max(500),
    author: z.string().max(100).optional(),
    extensions: z
      .object({
        // Names a trusted module compiled into the build, registered by id in
        // lib/plugins/content-seo-server.ts. Declaring a runtime that is not
        // registered installs the package but leaves its features inert.
        contentSeo: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/v\d+$/)
          .optional(),
      })
      .strict()
      .optional(),
    widgets: z
      .array(
        z
          .object({
            id: pluginIdSchema,
            name: z.string().trim().min(1).max(100),
            html: path.refine((value) => value.endsWith('.html')),
            css: path.refine((value) => value.endsWith('.css')).optional(),
            script: path.refine((value) => value.endsWith('.js')).optional(),
            height: z.number().int().min(60).max(1200).default(240),
          })
          .strict(),
      )
      .max(8),
    pageTemplates: z.array(pluginPageTemplateSchema).max(12).optional(),
    settings: z.array(pluginSettingSchema).max(20).default([]),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.extensions?.contentSeo && manifest.apiVersion !== 2)
      ctx.addIssue({ code: 'custom', message: 'Ekstensi SEO memerlukan API plugin 2.' })
    if (
      !manifest.widgets.length &&
      !manifest.pageTemplates?.length &&
      !manifest.extensions?.contentSeo
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Plugin harus menyediakan widget, templat laman, atau ekstensi SEO.',
      })
    if (
      new Set(manifest.pageTemplates?.map((item) => item.id)).size !==
      (manifest.pageTemplates?.length ?? 0)
    )
      ctx.addIssue({ code: 'custom', message: 'ID template laman harus unik.' })
    if (new Set(manifest.widgets.map((widget) => widget.id)).size !== manifest.widgets.length)
      ctx.addIssue({ code: 'custom', message: 'ID widget harus unik', path: ['widgets'] })
    if (new Set(manifest.settings.map((field) => field.key)).size !== manifest.settings.length)
      ctx.addIssue({ code: 'custom', message: 'Kunci pengaturan harus unik', path: ['settings'] })
    for (const field of manifest.settings)
      if (
        field.type === 'number' &&
        ((field.min !== undefined && field.default < field.min) ||
          (field.max !== undefined && field.default > field.max) ||
          (field.min !== undefined && field.max !== undefined && field.min > field.max))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Batas/default angka tidak valid',
          path: ['settings'],
        })
  })
export const pluginSlots = ['home-top', 'home-bottom', 'article-after', 'footer'] as const
export const pluginSlotLabels: Record<(typeof pluginSlots)[number], string> = {
  'home-top': 'Awal beranda',
  'home-bottom': 'Akhir beranda',
  'article-after': 'Setelah artikel',
  footer: 'Sebelum footer',
}
export const pluginConfigSchema = z
  .object({
    settings: z.record(key, z.union([z.string().max(10000), z.boolean(), z.number().finite()])),
    placements: z
      .array(z.object({ widgetId: pluginIdSchema, slot: z.enum(pluginSlots) }).strict())
      .max(32),
  })
  .strict()
  .refine(
    (config) =>
      new Set(config.placements.map((item) => `${item.slot}:${item.widgetId}`)).size ===
      config.placements.length,
    'Penempatan widget tidak boleh duplikat',
  )
export type PluginManifest = z.infer<typeof pluginManifestSchema>
export type PluginConfig = z.infer<typeof pluginConfigSchema>
export type PluginSlot = (typeof pluginSlots)[number]
export type PluginActionState = { error?: string; success?: string; revision?: number }
export type PluginChoice = {
  id: string
  name: string
  enabled: boolean
  widgets: PluginManifest['widgets']
}

export function defaultPluginConfig(manifest: PluginManifest): PluginConfig {
  return {
    settings: Object.fromEntries(manifest.settings.map((field) => [field.key, field.default])),
    placements: [],
  }
}
function settingValueSchema(field: PluginManifest['settings'][number]): z.ZodType {
  if (field.type === 'boolean') return z.boolean()
  if (field.type === 'number') {
    let number = z.number().finite()
    if (field.min !== undefined) number = number.min(field.min)
    if (field.max !== undefined) number = number.max(field.max)
    return number
  }
  return field.type === 'color'
    ? z.string().regex(/^#[0-9a-fA-F]{6}$/)
    : z.string().max(field.type === 'text' ? 1000 : 10000)
}
export function parsePluginConfig(manifest: PluginManifest, value: unknown): PluginConfig {
  const config = pluginConfigSchema.parse(value)
  const fields: Record<string, z.ZodType> = {}
  for (const field of manifest.settings) {
    fields[field.key] = settingValueSchema(field).default(field.default)
  }
  const settings = z.object(fields).strict().parse(config.settings) as PluginConfig['settings']
  if (
    config.placements.some(
      (item) => !manifest.widgets.some((widget) => widget.id === item.widgetId),
    )
  )
    throw new Error('Widget penempatan tidak ditemukan di plugin')
  return { settings, placements: config.placements }
}

export function migratePluginConfig(manifest: PluginManifest, current: PluginConfig): PluginConfig {
  const settings = Object.fromEntries(
    manifest.settings.map((field) => {
      const compatible = settingValueSchema(field).safeParse(current.settings[field.key])
      return [field.key, compatible.success ? compatible.data : field.default]
    }),
  )
  return parsePluginConfig(manifest, { settings, placements: current.placements })
}
