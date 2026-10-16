import { z } from 'zod'

export const primitiveCapabilities = [
  'read',
  'edit_profile',
  'edit_posts',
  'edit_others_posts',
  'edit_published_posts',
  'publish_posts',
  'delete_posts',
  'delete_others_posts',
  'delete_published_posts',
  'read_private_posts',
  'edit_pages',
  'edit_others_pages',
  'edit_published_pages',
  'publish_pages',
  'delete_pages',
  'delete_others_pages',
  'delete_published_pages',
  'read_private_pages',
  'upload_files',
  'manage_categories',
  'moderate_comments',
  'manage_options',
  'list_users',
  'edit_users',
  'install_plugins',
  'activate_plugins',
  'delete_plugins',
  'install_themes',
  'switch_themes',
  'edit_theme_options',
] as const
export type PrimitiveCapability = (typeof primitiveCapabilities)[number]
export const roleNameSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z][a-z0-9_-]*$/)
export const roleDefinitionsSchema = z
  .record(
    roleNameSchema,
    z
      .object({
        label: z.string().trim().min(1).max(100),
        capabilities: z
          .array(z.enum(primitiveCapabilities))
          .max(primitiveCapabilities.length)
          .refine((value) => new Set(value).size === value.length, 'Kapabilitas harus unik.'),
      })
      .strict(),
  )
  .refine(
    (value) => Object.keys(value).length <= 100 && !('admin' in value),
    'Maksimal 100 peran; admin adalah alias reserved.',
  )
  .refine(
    (value) =>
      ['read', 'manage_options', 'list_users', 'edit_users'].every((cap) =>
        value.administrator?.capabilities.includes(cap as PrimitiveCapability),
      ),
    'Administrator harus mempertahankan akses pemulihan.',
  )
export function canonicalRole(role: string) {
  return role === 'admin' ? 'administrator' : role
}
export function initialRoles(): z.infer<typeof roleDefinitionsSchema> {
  const editor = primitiveCapabilities.filter(
    (cap) =>
      ![
        'manage_options',
        'list_users',
        'edit_users',
        'install_plugins',
        'activate_plugins',
        'delete_plugins',
        'install_themes',
        'switch_themes',
        'edit_theme_options',
      ].includes(cap),
  )
  return {
    administrator: { label: 'Administrator', capabilities: [...primitiveCapabilities] },
    editor: { label: 'Editor', capabilities: editor },
    author: {
      label: 'Penulis',
      capabilities: [
        'read',
        'edit_profile',
        'edit_posts',
        'edit_published_posts',
        'publish_posts',
        'delete_posts',
        'delete_published_posts',
        'upload_files',
      ],
    },
    contributor: {
      label: 'Kontributor',
      capabilities: ['read', 'edit_profile', 'edit_posts', 'delete_posts'],
    },
    subscriber: { label: 'Pelanggan', capabilities: ['read', 'edit_profile'] },
  }
}
export function createRoleRegistry(definitions: unknown = initialRoles()) {
  const entries = new Map(Object.entries(roleDefinitionsSchema.parse(definitions)))
  // Existing admin accounts are a compatibility alias, never a weaker role.
  if (!entries.has('administrator')) throw new Error('Peran administrator wajib tersedia.')
  return {
    register(name: string, label: string, capabilities: PrimitiveCapability[]) {
      roleNameSchema.parse(name)
      if (name === 'admin' || entries.has(name)) throw new Error('Peran sudah terdaftar/reserved.')
      const parsed = roleDefinitionsSchema.parse({
        ...Object.fromEntries(entries),
        [name]: { label, capabilities },
      })[name]!
      entries.set(name, parsed)
    },
    get: (name: string) => {
      const row = entries.get(canonicalRole(name))
      return row ? structuredClone(row) : undefined
    },
    all: () => Object.fromEntries([...entries].map(([name, row]) => [name, structuredClone(row)])),
    has: (role: string, cap: string) =>
      primitiveCapabilities.includes(cap as PrimitiveCapability) &&
      !!entries.get(canonicalRole(role))?.capabilities.includes(cap as PrimitiveCapability),
  }
}
export type RoleRegistry = ReturnType<typeof createRoleRegistry>
export type Actor = { id: string; role: string; active: boolean }
export type PermissionObject = {
  type: string
  status: string
  authorId: string | null
  visibility?: string
  publishedAt?: Date | null
  capabilityType?: string
  public?: boolean
  statusPublic?: boolean
}
export type ObjectCapability = 'read_post' | 'edit_post' | 'delete_post'
const defaults = createRoleRegistry()
/** Session capabilities are resolved from the role registry on the server. */
export function userHasCapability(
  actor: { role: string; active?: boolean; capabilities?: readonly PrimitiveCapability[] },
  cap: PrimitiveCapability,
) {
  return (
    actor.active !== false &&
    primitiveCapabilities.includes(cap) &&
    (actor.capabilities ? actor.capabilities.includes(cap) : defaults.has(actor.role, cap))
  )
}

/** One mapping for server actions, query scopes and core APIs. Unknown always denies. */
export function currentUserCan(
  actor: Actor | null,
  cap: PrimitiveCapability | ObjectCapability,
  object?: PermissionObject,
  roles: RoleRegistry = defaults,
  now = new Date(),
): boolean {
  if (actor && (!actor.active || !roles.get(actor.role))) return false
  if (primitiveCapabilities.includes(cap as PrimitiveCapability))
    return !!actor && roles.has(actor.role, cap)
  if (!object || !['read_post', 'edit_post', 'delete_post'].includes(cap)) return false
  const knownStatuses = [
    'publish',
    'published',
    'draft',
    'pending',
    'future',
    'private',
    'trash',
    'auto-draft',
    'inherit',
  ]
  if (
    (!knownStatuses.includes(object.status) && object.statusPublic === undefined) ||
    !['public', 'private', 'password'].includes(object.visibility ?? 'public')
  )
    return false
  const capabilityType =
    object.capabilityType ??
    (object.type === 'page' ? 'page' : ['post', 'attachment'].includes(object.type) ? 'post' : null)
  const family = capabilityType === 'page' ? 'pages' : capabilityType === 'post' ? 'posts' : null
  if (!family) {
    if (object.type === 'user_request') return !!actor && roles.has(actor.role, 'manage_options')
    const themeTypes = [
      'wp_navigation',
      'wp_template',
      'wp_template_part',
      'wp_global_styles',
      'nav_menu_item',
      'wp_block',
    ]
    return (
      !!actor &&
      (themeTypes.includes(object.type) || capabilityType === 'theme') &&
      roles.has(actor.role, 'edit_theme_options')
    )
  }
  const published = object.statusPublic ?? ['publish', 'published'].includes(object.status)
  const publiclyReadable =
    (object.public ?? ['post', 'page'].includes(object.type)) &&
    published &&
    (object.visibility ?? 'public') === 'public' &&
    !!object.publishedAt &&
    object.publishedAt <= now
  if (cap === 'read_post' && publiclyReadable) return true
  if (!actor || !roles.has(actor.role, 'read')) return false
  const own = !!object.authorId && object.authorId === actor.id
  if (cap === 'read_post') {
    if (object.status === 'private' || object.visibility === 'private')
      return own || roles.has(actor.role, `read_private_${family}`)
    // A password grant is a separate public flow. Edit permission can read it.
    return currentUserCan(actor, 'edit_post', object, roles, now)
  }
  const verb = cap === 'edit_post' ? 'edit' : 'delete'
  if (!roles.has(actor.role, `${verb}_${family}`)) return false
  if (!own && !roles.has(actor.role, `${verb}_others_${family}`)) return false
  if (published && !roles.has(actor.role, `${verb}_published_${family}`)) return false
  return true
}
