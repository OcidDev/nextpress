import { sql, type SQL } from 'drizzle-orm'
import type { CoreTransaction } from '@/lib/db/meta-store'
import type { CoreRegistry } from './registry'
import type { Actor, RoleRegistry } from './roles'
import type { ContentRecord } from './content'
export type { ContentRecord }
import type { Post, PostSummary, Paginated, Author, AuthorSocial, Category } from '@/types'
import { wordCount } from '@/lib/content/sanitize'
import { z } from 'zod'
import { currentUserCan } from './roles'
import { createPostgresMetaReader } from '@/lib/db/meta-store'

export type TaxQueryClause = {
  taxonomy: string
  terms: string | number | (string | number)[]
  field?: 'slug' | 'id' | 'name'
  operator?: 'IN' | 'NOT IN' | 'AND'
}

export type TaxQuery = {
  relation?: 'AND' | 'OR'
  queries: TaxQueryClause[]
}

export type MetaQueryClause = {
  key: string
  value?: unknown
  compare?: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'NOT LIKE' | 'EXISTS' | 'NOT EXISTS'
  type?: 'CHAR' | 'NUMERIC' | 'DATETIME' | 'BOOLEAN'
}

export type MetaQuery = {
  relation?: 'AND' | 'OR'
  queries: MetaQueryClause[]
}

export type DateQuery = {
  year?: number
  month?: number
  day?: number
  before?: Date | string
  after?: Date | string
  inclusive?: boolean
}

export type ContentOrderBy =
  'date' | 'modified' | 'title' | 'menu_order' | 'id' | 'author' | 'parent' | 'slug' | 'rand'

export type ContentOrder = 'ASC' | 'DESC' | 'asc' | 'desc'

export interface QueryContentArgs {
  type?: string | string[]
  status?: string | string[]
  context?: 'view' | 'edit'

  id?: string
  includeIds?: string[]
  excludeIds?: string[]
  slug?: string
  parentId?: string | null
  parentIn?: string[]

  authorId?: string | string[]
  authorSlug?: string

  search?: string

  taxQuery?: TaxQuery | TaxQueryClause[]
  metaQuery?: MetaQuery | MetaQueryClause[]

  dateQuery?: DateQuery
  year?: number
  month?: number
  day?: number

  orderBy?: ContentOrderBy
  order?: ContentOrder
  page?: number
  perPage?: number
  offset?: number

  noFoundRows?: boolean
  fields?: 'all' | 'ids' | 'summary'
}

export interface QueryContentResult<T = ContentRecord> {
  items: T[]
  total: number
  totalPages: number
  page: number
  perPage: number
}

export type EnrichedContentRecord = ContentRecord & {
  terms: Array<{
    id: string
    name: string
    slug: string
    taxonomy: string
    description?: string
  }>
  categories: Category[]
  tags: string[]
  meta: Record<string, unknown>
  author?: Author
}

const idSchema = z.string().min(1).max(32)
const namesSchema = z.union([z.string().min(1).max(32), z.array(z.string().min(1).max(32)).max(64)])
const taxClauseSchema = z
  .object({
    taxonomy: z.string().min(1).max(32),
    terms: z.union([
      z.string().max(200),
      z.number().finite(),
      z.array(z.union([z.string().max(200), z.number().finite()])).max(200),
    ]),
    field: z.enum(['slug', 'id', 'name']).optional(),
    operator: z.enum(['IN', 'NOT IN', 'AND']).optional(),
  })
  .strict()
const metaClauseSchema = z
  .object({
    key: z.string().min(1).max(191),
    value: z.json().optional(),
    compare: z
      .enum(['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'EXISTS', 'NOT EXISTS'])
      .optional(),
    type: z.enum(['CHAR', 'NUMERIC', 'DATETIME', 'BOOLEAN']).optional(),
  })
  .strict()
const queryGroup = <T extends z.ZodType>(clause: T) =>
  z.union([
    z.array(clause).max(32),
    z
      .object({ relation: z.enum(['AND', 'OR']).optional(), queries: z.array(clause).max(32) })
      .strict(),
  ])
const dateValue = z.union([z.date(), z.iso.datetime({ offset: true }), z.iso.date()])
const querySchema = z
  .object({
    type: namesSchema.optional(),
    status: namesSchema.optional(),
    context: z.enum(['view', 'edit']).optional(),
    id: idSchema.optional(),
    includeIds: z.array(idSchema).max(1000).optional(),
    excludeIds: z.array(idSchema).max(1000).optional(),
    slug: z.string().max(200).optional(),
    parentId: idSchema.nullable().optional(),
    parentIn: z.array(idSchema).max(1000).optional(),
    authorId: z
      .union([z.string().min(1).max(128), z.array(z.string().min(1).max(128)).max(200)])
      .optional(),
    authorSlug: z.string().max(160).optional(),
    search: z.string().max(200).optional(),
    taxQuery: queryGroup(taxClauseSchema).optional(),
    metaQuery: queryGroup(metaClauseSchema).optional(),
    dateQuery: z
      .object({
        year: z.number().int().min(1).max(9999).optional(),
        month: z.number().int().min(1).max(12).optional(),
        day: z.number().int().min(1).max(31).optional(),
        before: dateValue.optional(),
        after: dateValue.optional(),
        inclusive: z.boolean().optional(),
      })
      .strict()
      .optional(),
    year: z.number().int().min(1).max(9999).optional(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    orderBy: z
      .enum(['date', 'modified', 'title', 'menu_order', 'id', 'author', 'parent', 'slug', 'rand'])
      .optional(),
    order: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.number().finite().int().optional(),
    perPage: z.number().finite().int().optional(),
    offset: z.number().int().min(0).max(10000000).optional(),
    noFoundRows: z.boolean().optional(),
    fields: z.enum(['all', 'ids', 'summary']).optional(),
  })
  .strict()

function editPermissionCondition(
  registry: CoreRegistry,
  actor: Actor,
  roles: RoleRegistry,
  alias = 'c',
) {
  const typeColumn = sql.raw(`${alias}.type`),
    statusColumn = sql.raw(`${alias}.status`)
  const ownerColumn = sql.raw(`${alias}.author_id`)
  const permissions: SQL[] = []
  for (const type of registry.types.all()) {
    const own: string[] = [],
      others: string[] = []
    for (const status of registry.statuses.all()) {
      const object = {
        type: type.name,
        status: status.name,
        capabilityType: type.capabilityType,
        public: type.public,
        statusPublic: status.public,
        visibility: 'public',
      }
      if (currentUserCan(actor, 'edit_post', { ...object, authorId: null }, roles))
        others.push(status.name)
      else if (currentUserCan(actor, 'edit_post', { ...object, authorId: actor.id }, roles))
        own.push(status.name)
    }
    const variants: SQL[] = []
    const statuses = (names: string[]) =>
      sql`${statusColumn} in (${sql.join(
        names.map((name) => sql`${name}`),
        sql`,`,
      )})`
    if (others.length) variants.push(statuses(others))
    if (own.length) variants.push(sql`(${ownerColumn} = ${actor.id} and ${statuses(own)})`)
    if (variants.length)
      permissions.push(sql`(${typeColumn}=${type.name} and (${sql.join(variants, sql` or `)}))`)
  }
  return permissions.length ? sql`(${sql.join(permissions, sql` or `)})` : sql`false`
}

function contentRow(value: Record<string, unknown>): ContentRecord {
  return {
    ...value,
    createdAt: new Date(value.createdAt as string | Date),
    modifiedAt: new Date(value.modifiedAt as string | Date),
    publishedAt: value.publishedAt ? new Date(value.publishedAt as string | Date) : null,
  } as ContentRecord
}

function safeContentRecord(record: ContentRecord): ContentRecord {
  const { passwordHash, ...safe } = record
  void passwordHash
  return safe as ContentRecord
}

function buildTaxClause(clause: TaxQueryClause): SQL | null {
  const rawTerms = Array.isArray(clause.terms) ? clause.terms : [clause.terms]
  const terms = [...new Set(rawTerms.map((t) => String(t).trim()).filter(Boolean))]
  if (!terms.length) return clause.operator === 'NOT IN' ? sql`true` : sql`false`
  const field = clause.field ?? 'slug'
  const operator = (clause.operator ?? 'IN').toUpperCase()

  const termCol = field === 'id' ? sql`t.id` : field === 'name' ? sql`t.name` : sql`t.slug`
  const termValues = sql.join(
    terms.map((t) => sql`${t}`),
    sql`,`,
  )

  if (operator === 'AND') {
    return sql`c.id in (
      select r.content_id
      from cms_term_relationships r
      join cms_term_taxonomy tt on tt.id = r.term_taxonomy_id
      join cms_terms t on t.id = tt.term_id
      where tt.taxonomy = ${clause.taxonomy}
        and ${termCol} in (${termValues})
      group by r.content_id
      having count(distinct ${termCol}) >= ${terms.length}
    )`
  }

  const existsClause = sql`exists (
    select 1
    from cms_term_relationships r
    join cms_term_taxonomy tt on tt.id = r.term_taxonomy_id
    join cms_terms t on t.id = tt.term_id
    where r.content_id = c.id
      and tt.taxonomy = ${clause.taxonomy}
      and ${termCol} in (${termValues})
  )`

  if (operator === 'NOT IN') {
    return sql`not ${existsClause}`
  }
  return existsClause
}

function buildTaxQuery(taxQuery?: TaxQuery | TaxQueryClause[]): SQL | null {
  if (!taxQuery) return null
  const isArray = Array.isArray(taxQuery)
  const clauses = isArray ? taxQuery : taxQuery.queries
  const relation = isArray ? 'AND' : (taxQuery.relation ?? 'AND').toUpperCase()
  const built = clauses.map(buildTaxClause).filter((c): c is SQL => c !== null)
  if (!built.length) return null
  if (built.length === 1) return built[0]!
  return relation === 'OR'
    ? sql`(${sql.join(built, sql` or `)})`
    : sql`(${sql.join(built, sql` and `)})`
}

function buildMetaClause(clause: MetaQueryClause): SQL | null {
  const compare = (clause.compare ?? '=').toUpperCase()
  const key = clause.key.trim()
  if (!key) return null

  if (compare === 'EXISTS') {
    return sql`exists (select 1 from cms_content_meta cm where cm.object_id = c.id and cm.meta_key = ${key})`
  }
  if (compare === 'NOT EXISTS') {
    return sql`not exists (select 1 from cms_content_meta cm where cm.object_id = c.id and cm.meta_key = ${key})`
  }

  const jsonVal = JSON.stringify(clause.value ?? null)
  if (compare === '=') {
    return sql`exists (select 1 from cms_content_meta cm where cm.object_id = c.id and cm.meta_key = ${key} and cm.meta_value = ${jsonVal}::jsonb)`
  }
  if (compare === '!=') {
    return sql`exists (select 1 from cms_content_meta cm where cm.object_id = c.id and cm.meta_key = ${key} and cm.meta_value <> ${jsonVal}::jsonb)`
  }
  if (compare === 'LIKE') {
    const pattern = `%${String(clause.value ?? '')}%`
    return sql`exists (select 1 from cms_content_meta cm where cm.object_id = c.id and cm.meta_key = ${key} and cm.meta_value::text ilike ${pattern})`
  }
  if (compare === 'NOT LIKE') {
    const pattern = `%${String(clause.value ?? '')}%`
    return sql`not exists (select 1 from cms_content_meta cm where cm.object_id = c.id and cm.meta_key = ${key} and cm.meta_value::text ilike ${pattern})`
  }
  if (['>', '>=', '<', '<='].includes(compare)) {
    const num = Number(clause.value)
    if (Number.isFinite(num)) {
      const op =
        compare === '>' ? sql`>` : compare === '>=' ? sql`>=` : compare === '<' ? sql`<` : sql`<=`
      return sql`exists (select 1 from cms_content_meta cm where cm.object_id = c.id and cm.meta_key = ${key}
        and case when jsonb_typeof(cm.meta_value)='number' then (cm.meta_value #>> '{}')::numeric end ${op} ${num})`
    }
  }
  return null
}

function buildMetaQuery(metaQuery?: MetaQuery | MetaQueryClause[]): SQL | null {
  if (!metaQuery) return null
  const isArray = Array.isArray(metaQuery)
  const clauses = isArray ? metaQuery : metaQuery.queries
  const relation = isArray ? 'AND' : (metaQuery.relation ?? 'AND').toUpperCase()
  const built = clauses.map(buildMetaClause).filter((c): c is SQL => c !== null)
  if (!built.length) return null
  if (built.length === 1) return built[0]!
  return relation === 'OR'
    ? sql`(${sql.join(built, sql` or `)})`
    : sql`(${sql.join(built, sql` and `)})`
}

function buildDateConditions(date?: DateQuery, year?: number, month?: number, day?: number): SQL[] {
  const conds: SQL[] = []
  const y = date?.year ?? year
  const m = date?.month ?? month
  const d = date?.day ?? day
  if (y && Number.isInteger(y)) {
    conds.push(sql`extract(year from c.published_at at time zone 'Asia/Jakarta') = ${y}`)
  }
  if (m && Number.isInteger(m)) {
    conds.push(sql`extract(month from c.published_at at time zone 'Asia/Jakarta') = ${m}`)
  }
  if (d && Number.isInteger(d)) {
    conds.push(sql`extract(day from c.published_at at time zone 'Asia/Jakarta') = ${d}`)
  }
  if (date?.before) {
    const beforeDate = date.before instanceof Date ? date.before : new Date(date.before)
    conds.push(
      date.inclusive ? sql`c.published_at <= ${beforeDate}` : sql`c.published_at < ${beforeDate}`,
    )
  }
  if (date?.after) {
    const afterDate = date.after instanceof Date ? date.after : new Date(date.after)
    conds.push(
      date.inclusive ? sql`c.published_at >= ${afterDate}` : sql`c.published_at > ${afterDate}`,
    )
  }
  return conds
}

function buildOrderBy(orderBy: ContentOrderBy = 'date', order: ContentOrder = 'desc'): SQL {
  const dir = order.toLowerCase() === 'asc' ? sql`asc` : sql`desc`
  const tieBreaker = sql`, c.id ${dir}`
  switch (orderBy) {
    case 'modified':
      return sql`c.modified_at ${dir}${tieBreaker}`
    case 'title':
      return sql`c.title ${dir}${tieBreaker}`
    case 'menu_order':
      return sql`c.menu_order ${dir}${tieBreaker}`
    case 'slug':
      return sql`c.slug ${dir}${tieBreaker}`
    case 'author':
      return sql`coalesce(c.author_id, c.legacy_author_id) ${dir}${tieBreaker}`
    case 'parent':
      return sql`c.parent_id ${dir}${tieBreaker}`
    case 'rand':
      return sql`random()`
    case 'id':
      return sql`c.id ${dir}`
    case 'date':
    default:
      return sql`c.published_at ${dir} nulls last, c.created_at ${dir}${tieBreaker}`
  }
}

/**
 * Query adaptor bersama untuk konten inti. Mendukung tipe, status, taksonomi,
 * meta, tanggal, penulis, pencarian, paginasi deterministik, dan aturan akses.
 */
export async function queryContent(
  tx: CoreTransaction,
  args: QueryContentArgs = {},
  registry: CoreRegistry,
  actor: Actor | null = null,
  roles: RoleRegistry,
  now = new Date(),
): Promise<QueryContentResult<ContentRecord>> {
  querySchema.parse(args)
  const taxClauses = Array.isArray(args.taxQuery) ? args.taxQuery : (args.taxQuery?.queries ?? [])
  for (const clause of taxClauses) {
    const taxonomy = registry.taxonomies.get(clause.taxonomy)
    if (!taxonomy || ((args.context ?? 'view') === 'view' && !taxonomy.public))
      throw new Error('Taksonomi query tidak tersedia dalam konteks ini.')
  }
  const metaClauses = Array.isArray(args.metaQuery)
    ? args.metaQuery
    : (args.metaQuery?.queries ?? [])
  for (const clause of metaClauses) {
    const definition = registry.meta.get('content', clause.key)
    if (!definition || ((args.context ?? 'view') === 'view' && !definition.showInRest))
      throw new Error('Meta query tidak tersedia dalam konteks ini.')
    if (JSON.stringify(clause.value ?? null).length > 65536)
      throw new Error('Nilai query meta terlalu besar.')
    if (clause.type && clause.type !== 'NUMERIC')
      throw new Error('Cast meta query ini belum didukung.')
    if (
      ['>', '>=', '<', '<='].includes(clause.compare ?? '') &&
      !Number.isFinite(Number(clause.value))
    )
      throw new Error('Perbandingan numerik memerlukan angka finite.')
  }
  const context = args.context ?? 'view'
  const page = Math.max(1, Math.min(100000, Number(args.page) || 1))
  const perPage = Math.max(1, Math.min(100, Number(args.perPage) || 10))
  const offset = args.offset !== undefined ? Math.max(0, args.offset) : (page - 1) * perPage

  const conditions: SQL[] = []

  // 1. Types
  const rawTypes = args.type ? (Array.isArray(args.type) ? args.type : [args.type]) : ['post']
  const requestedTypes = rawTypes.filter((t) => Boolean(registry.types.get(t)))
  if (!requestedTypes.length) {
    return { items: [], total: 0, totalPages: 0, page, perPage }
  }

  if (context === 'view') {
    const publicTypes = requestedTypes.filter((t) => registry.types.get(t)?.public)
    if (!publicTypes.length) {
      return { items: [], total: 0, totalPages: 0, page, perPage }
    }
    conditions.push(
      sql`c.type in (${sql.join(
        publicTypes.map((t) => sql`${t}`),
        sql`,`,
      )})`,
    )
  } else {
    conditions.push(
      sql`c.type in (${sql.join(
        requestedTypes.map((t) => sql`${t}`),
        sql`,`,
      )})`,
    )
  }

  // 2. Status & Visibility & Permissions
  if (context === 'view') {
    const rawStatuses = args.status
      ? Array.isArray(args.status)
        ? args.status
        : [args.status]
      : ['publish']
    const publicStatuses = rawStatuses.filter((s) => registry.statuses.get(s)?.public)
    if (!publicStatuses.length) {
      return { items: [], total: 0, totalPages: 0, page, perPage }
    }
    conditions.push(
      sql`c.status in (${sql.join(
        publicStatuses.map((s) => sql`${s}`),
        sql`,`,
      )})`,
    )
    conditions.push(sql`c.visibility = 'public'`)
    conditions.push(sql`c.published_at is not null and c.published_at <= ${now}`)
  } else {
    // Context === 'edit'
    if (!actor || !actor.active || !roles.get(actor.role)) {
      return { items: [], total: 0, totalPages: 0, page, perPage }
    }

    if (args.status) {
      const rawStatuses = Array.isArray(args.status) ? args.status : [args.status]
      const validStatuses = rawStatuses.filter((s) => Boolean(registry.statuses.get(s)))
      if (!validStatuses.length) {
        return { items: [], total: 0, totalPages: 0, page, perPage }
      }
      conditions.push(
        sql`c.status in (${sql.join(
          validStatuses.map((s) => sql`${s}`),
          sql`,`,
        )})`,
      )
    }

    const direct = editPermissionCondition(registry, actor, roles)
    if (requestedTypes.some((type) => ['revision', 'attachment'].includes(type))) {
      const inherited = editPermissionCondition(registry, actor, roles, 'ancestor')
      conditions.push(sql`(
        (not (c.type='revision' or (c.type='attachment' and c.status='inherit' and c.parent_id is not null)) and ${direct})
        or exists (with recursive ancestry as (
          select c.id,c.type,c.status,c.author_id,c.parent_id,array[c.id]::varchar[] as path
          union all select p.id,p.type,p.status,p.author_id,p.parent_id,child.path || p.id
          from cms_content p join ancestry child on child.parent_id=p.id
          where (child.type='revision' or (child.type='attachment' and child.status='inherit'))
            and not p.id=any(child.path) and cardinality(child.path)<64
        ) select 1 from ancestry ancestor
          where not (ancestor.type='revision' or (ancestor.type='attachment' and ancestor.status='inherit' and ancestor.parent_id is not null))
            and ${inherited})
      )`)
    } else conditions.push(direct)
  }

  // 3. ID Lookups
  if (args.id) {
    conditions.push(sql`c.id = ${args.id}`)
  }
  if (args.includeIds?.length) {
    const valid = args.includeIds.filter((id) => /^[a-zA-Z0-9_-]{1,32}$/.test(id))
    if (!valid.length) return { items: [], total: 0, totalPages: 0, page, perPage }
    conditions.push(
      sql`c.id in (${sql.join(
        valid.map((id) => sql`${id}`),
        sql`,`,
      )})`,
    )
  }
  if (args.excludeIds?.length) {
    const valid = args.excludeIds.filter((id) => /^[a-zA-Z0-9_-]{1,32}$/.test(id))
    if (valid.length) {
      conditions.push(
        sql`c.id not in (${sql.join(
          valid.map((id) => sql`${id}`),
          sql`,`,
        )})`,
      )
    }
  }

  // 4. Slug
  if (args.slug) {
    conditions.push(sql`c.slug = ${args.slug}`)
  }

  // 5. Parent
  if (args.parentId !== undefined) {
    if (args.parentId === null) {
      conditions.push(sql`c.parent_id is null`)
    } else {
      conditions.push(sql`c.parent_id = ${args.parentId}`)
    }
  }
  if (args.parentIn?.length) {
    const valid = args.parentIn.filter((id) => /^[a-zA-Z0-9_-]{1,32}$/.test(id))
    if (valid.length) {
      conditions.push(
        sql`c.parent_id in (${sql.join(
          valid.map((id) => sql`${id}`),
          sql`,`,
        )})`,
      )
    }
  }

  // 6. Author
  if (args.authorId) {
    const rawIds = Array.isArray(args.authorId) ? args.authorId : [args.authorId]
    const authorIds = rawIds.filter(Boolean)
    if (authorIds.length) {
      const values = sql.join(
        authorIds.map((id) => sql`${id}`),
        sql`,`,
      )
      conditions.push(sql`(c.author_id in (${values}) or c.legacy_author_id in (${values}))`)
    }
  }
  if (args.authorSlug) {
    conditions.push(sql`exists (
      select 1 from authors a where (a.id = c.legacy_author_id or a.user_id = c.author_id) and a.slug = ${args.authorSlug}
    )`)
  }

  // 7. Search
  if (args.search?.trim()) {
    const pattern = `%${args.search.trim().slice(0, 200)}%`
    conditions.push(
      sql`(c.title ilike ${pattern} or c.content ilike ${pattern} or c.excerpt ilike ${pattern})`,
    )
  }

  // 8. Date
  const dateConds = buildDateConditions(args.dateQuery, args.year, args.month, args.day)
  conditions.push(...dateConds)

  // 9. Taxonomy Query
  const taxSql = buildTaxQuery(args.taxQuery)
  if (taxSql) conditions.push(taxSql)

  // 10. Meta Query
  const metaSql = buildMetaQuery(args.metaQuery)
  if (metaSql) conditions.push(metaSql)

  const whereClause = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``

  // Total count
  let total = 0
  if (!args.noFoundRows) {
    const countRes = await tx.execute(
      sql`select count(*)::int as total from cms_content c ${whereClause}`,
    )
    total = Number(countRes.rows[0]?.total ?? 0)
    if (total === 0) {
      return { items: [], total: 0, totalPages: 0, page, perPage }
    }
  }

  // Row selection
  const selectCols =
    args.fields === 'ids'
      ? sql`c.id`
      : args.fields === 'summary'
        ? sql`c.id,c.type,c.status,c.parent_id as "parentId",c.author_id as "authorId",c.legacy_author_id as "legacyAuthorId",
          c.slug,c.title,'' as content,c.format,c.excerpt,c.visibility,c.password_hash as "passwordHash",c.revision,
          c.published_at as "publishedAt",c.created_at as "createdAt",c.modified_at as "modifiedAt",c.comment_status as "commentStatus"`
        : sql`c.id,c.type,c.status,c.parent_id as "parentId",c.author_id as "authorId",c.legacy_author_id as "legacyAuthorId",
          c.slug,c.title,c.content,c.format,c.excerpt,c.visibility,c.password_hash as "passwordHash",c.revision,
          c.published_at as "publishedAt",c.created_at as "createdAt",c.modified_at as "modifiedAt",c.comment_status as "commentStatus"`

  const orderSql = buildOrderBy(args.orderBy, args.order)

  const rowsRes = await tx.execute(
    sql`select ${selectCols} from cms_content c ${whereClause} order by ${orderSql} limit ${perPage} offset ${offset}`,
  )

  const items = (rowsRes.rows as Record<string, unknown>[]).map((row) =>
    safeContentRecord(contentRow(row)),
  )

  if (args.noFoundRows) {
    total = items.length
  }

  return {
    items,
    total,
    totalPages: Math.ceil(total / perPage),
    page,
    perPage,
  }
}

/**
 * Batch-enriches ContentRecords with terms, meta, and author data
 * avoiding N+1 queries.
 */
export async function enrichContentRecords(
  tx: CoreTransaction,
  records: ContentRecord[],
): Promise<EnrichedContentRecord[]> {
  if (!records.length) return []
  const ids = records.map((r) => r.id)
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`,`,
  )

  // 1. Fetch terms
  const termsRes = await tx.execute(
    sql`select r.content_id as "contentId", t.id, t.name, t.slug, tt.taxonomy, tt.description
    from cms_term_relationships r
    join cms_term_taxonomy tt on tt.id = r.term_taxonomy_id
    join cms_terms t on t.id = tt.term_id
    where r.content_id in (${idList})
    order by r.term_order asc, lower(t.name) asc`,
  )

  const termsByContent = new Map<
    string,
    Array<{ id: string; name: string; slug: string; taxonomy: string; description?: string }>
  >()
  for (const row of termsRes.rows as Record<string, unknown>[]) {
    const cId = row.contentId as string
    if (!termsByContent.has(cId)) termsByContent.set(cId, [])
    termsByContent.get(cId)!.push({
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      taxonomy: row.taxonomy as string,
      description: (row.description as string) || undefined,
    })
  }

  // 2. Fetch meta
  const metaRows = await createPostgresMetaReader(tx).read('content', ids)

  const metaByContent = new Map<string, Record<string, unknown>>()
  const repeated = new Set<string>()
  for (const row of metaRows) {
    const objId = row.objectId as string
    if (!metaByContent.has(objId)) metaByContent.set(objId, {})
    const target = metaByContent.get(objId)!
    const key = row.key as string
    const val = row.value
    if (key in target) {
      const identity = JSON.stringify([objId, key])
      if (repeated.has(identity)) {
        ;(target[key] as unknown[]).push(val)
      } else {
        target[key] = [target[key], val]
        repeated.add(identity)
      }
    } else {
      target[key] = val
    }
  }

  // 3. Fetch Authors
  const userIds = [...new Set(records.map((r) => r.authorId).filter(Boolean))] as string[]
  const legacyIds = [...new Set(records.map((r) => r.legacyAuthorId).filter(Boolean))] as string[]

  const usersMap = new Map<string, Record<string, unknown>>()
  if (userIds.length) {
    const uList = sql.join(
      userIds.map((id) => sql`${id}`),
      sql`,`,
    )
    const uRes = await tx.execute(sql`select id, name, image from cms_user where id in (${uList})`)
    for (const u of uRes.rows as Record<string, unknown>[]) {
      usersMap.set(u.id as string, u)
    }
  }

  const legacyMap = new Map<string, Record<string, unknown>>()
  if (legacyIds.length) {
    const lList = sql.join(
      legacyIds.map((id) => sql`${id}`),
      sql`,`,
    )
    const lRes = await tx.execute(
      sql`select id, name, slug, avatar, bio, role, verified, social from authors where id in (${lList})`,
    )
    for (const a of lRes.rows as Record<string, unknown>[]) {
      legacyMap.set(a.id as string, a)
    }
  }

  // Map each record
  return records.map((record) => {
    const itemTerms = termsByContent.get(record.id) ?? []
    const categories: Category[] = itemTerms
      .filter((t) => t.taxonomy === 'category')
      .map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
      }))

    const tags: string[] = itemTerms.filter((t) => t.taxonomy === 'post_tag').map((t) => t.name)

    const meta = metaByContent.get(record.id) ?? {}

    let author: Author | undefined
    if (record.legacyAuthorId && legacyMap.has(record.legacyAuthorId)) {
      const leg = legacyMap.get(record.legacyAuthorId)!
      author = {
        id: leg.id as string,
        name: leg.name as string,
        slug: leg.slug as string,
        avatar: (leg.avatar as string) ?? undefined,
        bio: (leg.bio as string) ?? undefined,
        role: (leg.role as string) ?? undefined,
        verified: Boolean(leg.verified),
        social: (leg.social as AuthorSocial) ?? undefined,
      }
    } else if (record.authorId && usersMap.has(record.authorId)) {
      const usr = usersMap.get(record.authorId)!
      author = {
        id: usr.id as string,
        name: (usr.name as string) || 'Pengguna',
        slug: ((usr.name as string) || 'user').toLowerCase().replace(/\s+/g, '-'),
        avatar: (usr.image as string) ?? undefined,
        verified: false,
      }
    }

    return {
      ...record,
      terms: itemTerms,
      categories,
      tags,
      meta,
      author,
    }
  })
}

/**
 * Transforms an EnrichedContentRecord into the Post shape
 * expected by blog templates, components, and feeds.
 */
export function contentRecordToPost(enriched: EnrichedContentRecord): Post {
  const meta = enriched.meta
  const legacy = (meta['_legacy_fields'] as Record<string, unknown>) ?? {}
  const field = (snake: string, camel: string) => legacy[snake] ?? legacy[camel]

  const defaultAuthor: Author = {
    id: enriched.authorId || enriched.legacyAuthorId || 'unknown',
    name: 'Penulis',
    slug: 'penulis',
    verified: false,
  }

  const rawStatus = enriched.status
  const status: Post['status'] =
    rawStatus === 'publish' ? 'published' : rawStatus === 'future' ? 'scheduled' : 'draft'

  const storedWords = field('word_count', 'wordCount')
  const storedReading = field('reading_time', 'readingTime')
  const words = typeof storedWords === 'number' ? storedWords : wordCount(enriched.content)
  const reading =
    typeof storedReading === 'number' ? storedReading : Math.max(1, Math.ceil(words / 200))

  return {
    id: enriched.id,
    slug: enriched.slug,
    title: enriched.title,
    excerpt: enriched.excerpt,
    content: enriched.content,
    featuredImage:
      (meta['featured_image'] as string) ??
      (field('featured_image', 'featuredImage') as string) ??
      undefined,
    featuredImageAlt:
      (meta['featured_image_alt'] as string) ??
      (field('featured_image_alt', 'featuredImageAlt') as string) ??
      undefined,
    isYoutube: Boolean(meta['is_youtube'] ?? field('is_youtube', 'isYoutube')),
    author: enriched.author ?? defaultAuthor,
    categories: enriched.categories,
    tags: enriched.tags,
    isSponsored: Boolean(meta['is_sponsored'] ?? field('is_sponsored', 'isSponsored')),
    isProduct: Boolean(meta['is_product'] ?? field('is_product', 'isProduct')),
    layout: (meta['layout'] as Post['layout']) ?? (legacy.layout as Post['layout']) ?? 'default',
    allowComments:
      enriched.commentStatus === 'open' &&
      (field('allow_comments', 'allowComments') === undefined ||
        Boolean(field('allow_comments', 'allowComments'))),
    showAds:
      field('show_ads', 'showAds') === undefined ? true : Boolean(field('show_ads', 'showAds')),
    readingTime: reading,
    wordCount: words,
    viewCount: Number(meta['view_count'] ?? field('view_count', 'viewCount') ?? 0),
    commentCount: Number(meta['comment_count'] ?? field('comment_count', 'commentCount') ?? 0),
    status,
    publishedAt: (enriched.publishedAt ?? enriched.createdAt).toISOString(),
    updatedAt: enriched.modifiedAt.toISOString(),
    legacyPath:
      (meta['legacy_path'] as string) ??
      (field('legacy_path', 'legacyPath') as string) ??
      undefined,
  }
}

/**
 * Transforms an EnrichedContentRecord into the PostSummary shape
 * (omitting content and contentHtml).
 */
export function contentRecordToPostSummary(enriched: EnrichedContentRecord): PostSummary {
  const { content, contentHtml, ...summary } = contentRecordToPost(enriched)
  void content
  void contentHtml
  return summary
}

/**
 * Creates query service attached to transaction and registry.
 */
export function createQueryService(
  tx: CoreTransaction,
  registry: CoreRegistry,
  actor: Actor | null,
  roles: RoleRegistry,
) {
  function publicMeta(record: EnrichedContentRecord, context: 'view' | 'edit') {
    return {
      ...record,
      terms: record.terms.filter((term) => {
        const definition = registry.taxonomies.get(term.taxonomy)
        return definition && (context === 'edit' || definition.public)
      }),
      meta: Object.fromEntries(
        Object.entries(record.meta).filter(([key]) => {
          const definition = registry.meta.get('content', key)
          return definition && (context === 'edit' || definition.showInRest)
        }),
      ),
    }
  }
  return {
    async find(args: QueryContentArgs = {}) {
      return queryContent(tx, args, registry, actor, roles)
    },
    async findEnriched(args: QueryContentArgs = {}) {
      const res = await queryContent(tx, args, registry, actor, roles)
      const enriched = await enrichContentRecords(tx, res.items)
      return {
        ...res,
        items: enriched.map((record) => publicMeta(record, args.context ?? 'view')),
      }
    },
    async findPosts(args: QueryContentArgs = {}): Promise<Paginated<PostSummary>> {
      const res = await queryContent(tx, { ...args, fields: 'summary' }, registry, actor, roles)
      const enriched = await enrichContentRecords(tx, res.items)
      return {
        items: enriched.map(contentRecordToPostSummary),
        page: res.page,
        perPage: res.perPage,
        total: res.total,
        totalPages: res.totalPages,
      }
    },
    async findBySlug(
      slug: string,
      type = 'post',
      context: 'view' | 'edit' = 'view',
    ): Promise<EnrichedContentRecord | null> {
      const res = await queryContent(
        tx,
        {
          slug,
          type,
          context,
          perPage: 1,
        },
        registry,
        actor,
        roles,
      )
      if (!res.items.length) return null
      const enriched = await enrichContentRecords(tx, [res.items[0]!])
      return enriched[0] ? publicMeta(enriched[0], context) : null
    },
    async get(
      id: string,
      context: 'view' | 'edit' = 'view',
    ): Promise<EnrichedContentRecord | null> {
      const res = await queryContent(
        tx,
        {
          id,
          type: ['post', 'page', 'attachment'],
          context,
          perPage: 1,
        },
        registry,
        actor,
        roles,
      )
      if (!res.items.length) return null
      const enriched = await enrichContentRecords(tx, [res.items[0]!])
      return enriched[0] ? publicMeta(enriched[0], context) : null
    },
  }
}
