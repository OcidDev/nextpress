import { z } from 'zod'

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export const MAX_OPTION_BYTES = 1024 * 1024
export const MAX_AUTOLOAD_BYTES = 64 * 1024
export const AUTOLOAD_BUDGET_BYTES = 256 * 1024
export const AUTOLOAD_MAX_KEYS = 128
export const optionNameSchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[a-zA-Z0-9_.:-]+$/)

export function jsonValue(value: unknown): JsonValue {
  // Reject undefined/non-JSON values before stringify can silently drop them.
  const parsed = z.json().parse(value) as JsonValue
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > MAX_OPTION_BYTES)
    throw new Error('Nilai option melebihi 1 MiB.')
  return structuredClone(parsed)
}

export type OptionRow = { name: string; value: JsonValue; autoload: boolean; legacy: boolean }
export type OptionDefinition = {
  schema: z.ZodType
  defaultValue?: () => unknown
  autoload?: boolean
  legacy?: boolean
}
export type OptionChange = { name: string; operation: 'add' | 'update' | 'delete' }
export interface OptionStore {
  autoload(): Promise<OptionRow[]>
  read(names: string[]): Promise<OptionRow[]>
  write(
    row: OptionRow,
    mode: 'add' | 'update',
    flags?: { preserveAutoload: boolean },
  ): Promise<boolean>
  delete(name: string): Promise<boolean>
}

export function createOptionRegistry() {
  const definitions = new Map<string, OptionDefinition>()
  return {
    register(name: string, definition: OptionDefinition) {
      optionNameSchema.parse(name)
      if (definitions.has(name)) throw new Error(`Option sudah terdaftar: ${name}`)
      if (definition.defaultValue) jsonValue(definition.schema.parse(definition.defaultValue()))
      definitions.set(name, { ...definition })
    },
    get: (name: string) => definitions.get(name),
  }
}
/** Explicit scope for Route Handlers, transactions and CLI; never a process cache. */
export function createOptionsApi(
  store: OptionStore,
  registry = createOptionRegistry(),
  onChange?: (change: OptionChange) => void | Promise<void>,
) {
  const values = new Map<string, OptionRow | undefined>()
  let preload: Promise<void> | undefined
  let generation = 0
  const invalidate = () => {
    generation++
    values.clear()
    preload = undefined
  }
  async function loadAutoload() {
    if (!preload) {
      const version = generation
      const pending = store.autoload().then((rows) => {
        if (version !== generation) return
        let bytes = 0
        for (const row of rows.slice(0, AUTOLOAD_MAX_KEYS)) {
          bytes += new TextEncoder().encode(JSON.stringify(row.value)).length
          if (bytes > AUTOLOAD_BUDGET_BYTES) break
          values.set(row.name, row)
        }
      })
      preload = pending
      try {
        await pending
      } catch (error) {
        if (preload === pending) preload = undefined
        throw error
      }
    } else await preload
  }
  async function getOptions(names: readonly string[]) {
    const keys = [...new Set(names.map((name) => optionNameSchema.parse(name)))]
    if (!keys.length) return new Map<string, JsonValue>()
    await loadAutoload()
    const missing = keys.filter((name) => !values.has(name))
    if (missing.length) {
      const version = generation
      const rows = new Map((await store.read(missing)).map((row) => [row.name, row]))
      if (version !== generation) return getOptions(keys)
      for (const name of missing) values.set(name, rows.get(name))
    }
    const result = new Map<string, JsonValue>()
    for (const name of keys) {
      const row = values.get(name)
      const fallback = registry.get(name)?.defaultValue
      if (row) result.set(name, structuredClone(row.value))
      else if (fallback) result.set(name, jsonValue(fallback()))
    }
    return result
  }
  async function write(
    mode: 'add' | 'update',
    name: string,
    value: unknown,
    flags: { autoload?: boolean } = {},
  ) {
    optionNameSchema.parse(name)
    const definition = registry.get(name)
    const parsed = jsonValue(definition ? definition.schema.parse(value) : value)
    const bytes = new TextEncoder().encode(JSON.stringify(parsed)).length
    if (flags.autoload && bytes > MAX_AUTOLOAD_BYTES)
      throw new Error('Option autoload melebihi 64 KiB.')
    const changed = await store.write(
      {
        name,
        value: parsed,
        autoload: (flags.autoload ?? definition?.autoload ?? false) && bytes <= MAX_AUTOLOAD_BYTES,
        legacy: definition?.legacy ?? false,
      },
      mode,
      { preserveAutoload: mode === 'update' && flags.autoload === undefined },
    )
    if (changed) {
      invalidate()
      await onChange?.({ name, operation: mode })
    }
    return changed
  }
  return {
    getOptions,
    getOption: async (name: string) => (await getOptions([name])).get(name),
    addOption: (name: string, value: unknown, flags?: { autoload?: boolean }) =>
      write('add', name, value, flags),
    updateOption: (name: string, value: unknown, flags?: { autoload?: boolean }) =>
      write('update', name, value, flags),
    async deleteOption(name: string) {
      optionNameSchema.parse(name)
      const changed = await store.delete(name)
      if (changed) {
        invalidate()
        await onChange?.({ name, operation: 'delete' })
      }
      return changed
    },
    invalidate,
  }
}
export type OptionsApi = ReturnType<typeof createOptionsApi>
