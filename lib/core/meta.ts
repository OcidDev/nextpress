import { z } from 'zod'
import { jsonValue, type JsonValue } from './options'

export const metaKinds = ['content', 'user', 'comment', 'term'] as const
export type MetaKind = (typeof metaKinds)[number]
export type MetaContext = 'view' | 'edit' | 'internal'
export type MetaRow = { id: string; objectId: string; key: string; value: JsonValue }
export const metaKeySchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[a-zA-Z0-9_.:-]+$/)
export const metaObjectIdSchema = z.string().min(1).max(128)
export type MetaDefinition = {
  schema: z.ZodType
  single?: boolean
  showInRest?: boolean
  defaultValue?: () => unknown
  sanitize?: (value: unknown) => unknown
}
export function createMetaRegistry() {
  const definitions = new Map<string, MetaDefinition>()
  return {
    register(kind: MetaKind, key: string, definition: MetaDefinition) {
      z.enum(metaKinds).parse(kind)
      metaKeySchema.parse(key)
      const name = kind + ':' + key
      if (definitions.has(name)) throw new Error(`Meta sudah terdaftar: ${name}`)
      if (key.startsWith('_') && definition.showInRest)
        throw new Error('Meta berawalan _ tidak boleh diekspos.')
      if (definition.defaultValue) jsonValue(definition.schema.parse(definition.defaultValue()))
      definitions.set(name, {
        ...definition,
        single: definition.single ?? true,
        showInRest: definition.showInRest ?? false,
      })
    },
    get: (kind: MetaKind, key: string) => {
      const definition = definitions.get(kind + ':' + key)
      return definition ? { ...definition } : undefined
    },
  }
}
export type MetaRegistry = ReturnType<typeof createMetaRegistry>
export interface MetaStore {
  read(kind: MetaKind, ids: string[]): Promise<MetaRow[]>
  add(
    kind: MetaKind,
    objectId: string,
    key: string,
    value: JsonValue,
    single: boolean,
  ): Promise<MetaRow>
  update(
    kind: MetaKind,
    objectId: string,
    key: string,
    id: string,
    value: JsonValue,
  ): Promise<boolean>
  delete(kind: MetaKind, objectId: string, key: string, id?: string): Promise<boolean>
}
export type MetaPermission = (
  kind: MetaKind,
  objectId: string,
  operation: 'read' | 'write',
  context: MetaContext,
) => boolean | Promise<boolean>
export type BatchMetaPermission = MetaPermission & {
  batch?: (kind: MetaKind, ids: readonly string[], context: MetaContext) => Promise<boolean[]>
}

/** Explicit scope. Mutation stores must serialize (kind,object,key) in a transaction. */
export function createMetaApi(store: MetaStore, registry: MetaRegistry, can: BatchMetaPermission) {
  const rows = new Map<string, MetaRow[]>()
  let generation = 0
  const contextSchema = z.enum(['view', 'edit', 'internal'])
  const objectKey = (kind: MetaKind, id: string) => kind + ':' + id
  async function preload(kind: MetaKind, ids: readonly string[]) {
    z.enum(metaKinds).parse(kind)
    const names = [...new Set(ids.map((id) => metaObjectIdSchema.parse(id)))]
    if (names.length > 200) throw new Error('Maksimal 200 objek per preload meta.')
    const missing = names.filter((id) => !rows.has(objectKey(kind, id)))
    if (missing.length) {
      const before = generation
      const found = await store.read(kind, missing)
      if (before !== generation) return preload(kind, ids)
      for (const id of missing)
        rows.set(
          objectKey(kind, id),
          found.filter((row) => row.objectId === id),
        )
    }
  }
  function definition(kind: MetaKind, key: string) {
    metaKeySchema.parse(key)
    const value = registry.get(kind, key)
    if (!value) throw new Error(`Meta tidak terdaftar: ${kind}:${key}`)
    return value
  }
  async function allowed(
    kind: MetaKind,
    id: string,
    context: MetaContext,
    operation: 'read' | 'write',
  ) {
    contextSchema.parse(context)
    z.enum(metaKinds).parse(kind)
    metaObjectIdSchema.parse(id)
    if (!(await can(kind, id, operation, context))) throw new Error('Izin meta ditolak.')
  }
  function valueFor(def: MetaDefinition, value: unknown) {
    const valueJson = jsonValue(def.schema.parse(def.sanitize ? def.sanitize(value) : value))
    if (new TextEncoder().encode(JSON.stringify(valueJson)).length > 65536)
      throw new Error('Nilai meta melebihi 64 KiB.')
    return valueJson
  }
  return {
    preload,
    async get(kind: MetaKind, id: string, key: string, context: MetaContext = 'view') {
      contextSchema.parse(context)
      const def = definition(kind, key)
      if (context === 'view' && !def.showInRest) return undefined
      await allowed(kind, id, context, 'read')
      await preload(kind, [id])
      const found = rows.get(objectKey(kind, id))!.filter((row) => row.key === key)
      if (found.length)
        return structuredClone(def.single ? found[0]!.value : found.map((row) => row.value))
      return def.defaultValue ? valueFor(def, def.defaultValue()) : def.single ? undefined : []
    },
    async list(kind: MetaKind, ids: readonly string[], context: MetaContext = 'view') {
      contextSchema.parse(context)
      z.enum(metaKinds).parse(kind)
      const unique = [...new Set(ids.map((id) => metaObjectIdSchema.parse(id)))]
      if (unique.length > 200) throw new Error('Maksimal 200 objek per preload meta.')
      if (can.batch) {
        const permissions = await can.batch(kind, unique, context)
        if (permissions.length !== unique.length || permissions.some((value) => value !== true))
          throw new Error('Izin meta ditolak.')
      } else for (const id of unique) await allowed(kind, id, context, 'read')
      await preload(kind, unique)
      const result = new Map<string, MetaRow[]>()
      for (const id of unique) {
        result.set(
          id,
          structuredClone(
            rows.get(objectKey(kind, id))!.filter((row) => {
              const def = registry.get(kind, row.key)
              return def && (context !== 'view' || def.showInRest)
            }),
          ),
        )
      }
      return result
    },
    async add(kind: MetaKind, id: string, key: string, value: unknown) {
      const def = definition(kind, key)
      await allowed(kind, id, 'edit', 'write')
      const result = await store.add(kind, id, key, valueFor(def, value), !!def.single)
      generation++
      rows.delete(objectKey(kind, id))
      return structuredClone(result)
    },
    async update(kind: MetaKind, id: string, key: string, rowId: string, value: unknown) {
      const def = definition(kind, key)
      await allowed(kind, id, 'edit', 'write')
      const changed = await store.update(
        kind,
        id,
        key,
        z.string().min(1).max(32).parse(rowId),
        valueFor(def, value),
      )
      generation++
      rows.delete(objectKey(kind, id))
      return changed
    },
    async delete(kind: MetaKind, id: string, key: string, rowId?: string) {
      definition(kind, key)
      await allowed(kind, id, 'edit', 'write')
      if (rowId !== undefined) z.string().min(1).max(32).parse(rowId)
      const changed = await store.delete(kind, id, key, rowId)
      generation++
      rows.delete(objectKey(kind, id))
      return changed
    },
    invalidate: () => {
      generation++
      rows.clear()
    },
  }
}
