import { z } from 'zod'

export const registryNameSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[a-z][a-z0-9_-]*$/)
const statusSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    public: z.boolean().default(false),
    internal: z.boolean().default(false),
    showInAdmin: z.boolean().default(true),
  })
  .strict()
export type PostStatusDefinition = z.output<typeof statusSchema> & { name: string }

export function createPostStatusRegistry() {
  const entries = new Map<string, PostStatusDefinition>()
  return {
    register(name: string, definition: z.input<typeof statusSchema>) {
      registryNameSchema.parse(name)
      if (entries.has(name)) throw new Error(`Status sudah terdaftar: ${name}`)
      const parsed = statusSchema.parse(definition)
      if (parsed.public && parsed.internal) throw new Error('Status internal tidak boleh publik.')
      entries.set(name, { name, ...parsed })
    },
    get: (name: string) => {
      const entry = entries.get(name)
      return entry ? structuredClone(entry) : undefined
    },
    all: () => [...entries.values()].map((entry) => structuredClone(entry)),
  }
}

export function registerInitialPostStatuses(registry: ReturnType<typeof createPostStatusRegistry>) {
  for (const [name, label] of Object.entries({
    publish: 'Terbit',
    future: 'Terjadwal',
    draft: 'Rancangan',
    pending: 'Menunggu tinjauan',
    private: 'Privat',
    trash: 'Sampah',
    'auto-draft': 'Rancangan otomatis',
    inherit: 'Mengikuti induk',
    'request-pending': 'Permintaan menunggu',
    'request-confirmed': 'Permintaan dikonfirmasi',
    'request-failed': 'Permintaan gagal',
    'request-completed': 'Permintaan selesai',
  })) {
    const internal = ['auto-draft', 'inherit'].includes(name) || name.startsWith('request-')
    registry.register(name, { label, public: name === 'publish', internal, showInAdmin: !internal })
  }
}
