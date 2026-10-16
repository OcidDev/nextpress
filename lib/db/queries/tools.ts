import { postPaths } from '@/lib/content/permalink-server'
import { getActiveTheme } from '@/lib/themes/manager'
import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { getDb, hasDatabase } from '@/lib/db'
import { requireAdmin, requireCapability } from '@/lib/admin'
import {
  posts,
  pages,
  authors,
  categories,
  postCategories,
  postTags,
  plugins,
} from '@/lib/db/schema'
import {
  runSiteHealthCheck,
  exportWxr,
  importWxr,
  type WxrPostExport,
  type SiteHealthReport,
} from '@/lib/core/tools'
import { parseBloggerXml, type BloggerImportSummary } from '@/lib/core/blogger-importer'
import { getSettings } from './settings'
import { ensureUserAuthor } from './user-authors'
import { ensureDefaultCategory } from './taxonomy'
import { projectPostToCore, projectPageToCore } from '@/lib/core/content-projection'
import { cleanHtml } from '@/lib/content/sanitize'
import { newId } from '@/lib/db/ids'
import { slugify } from '@/lib/utils'
import { lockContentStructure } from '@/lib/core/content-mapping'

export async function getSiteHealthReportData(): Promise<SiteHealthReport> {
  await requireCapability('manage_options')

  let dbConnected = false
  let activeTheme = 'unknown'
  let activePluginsList: string[] = []

  if (hasDatabase()) {
    try {
      const db = getDb()
      await db.execute(sql`SELECT 1`)
      dbConnected = true

      const pluginRows = await db
        .select({ id: plugins.id })
        .from(plugins)
        .where(eq(plugins.enabled, true))
      activePluginsList = pluginRows.map((p) => p.id)
    } catch {
      dbConnected = false
    }
  }

  try {
    activeTheme = (await getActiveTheme()).manifest.id
  } catch {
    // fallback
  }

  return runSiteHealthCheck({
    dbConnected,
    activeThemeId: activeTheme,
    activePlugins: activePluginsList,
    envSecrets: {
      db_pass: '***',
      auth_secret: '***',
    },
  })
}

export async function exportWxrData(filters?: {
  type?: 'all' | 'posts' | 'pages'
  status?: string
}): Promise<{ xml: string; filename: string }> {
  await requireAdmin()
  const db = getDb()
  const settings = await getSettings()

  const type = filters?.type || 'all'
  const items: WxrPostExport[] = []

  if (type === 'all' || type === 'posts') {
    const allPosts = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        content: posts.content,
        excerpt: posts.excerpt,
        status: posts.status,
        publishedAt: posts.publishedAt,
        authorId: posts.authorId,
      })
      .from(posts)

    // Authors mapping
    const authorRows = await db.select().from(authors)
    const authorMap = new Map(authorRows.map((a) => [a.id, a.name]))

    // Categories mapping
    const postCatRows = await db
      .select({
        postId: postCategories.postId,
        categoryName: categories.name,
      })
      .from(postCategories)
      .innerJoin(categories, eq(postCategories.categoryId, categories.id))

    const catMap = new Map<string, string[]>()
    for (const pc of postCatRows) {
      const list = catMap.get(pc.postId) || []
      list.push(pc.categoryName)
      catMap.set(pc.postId, list)
    }

    // Tags mapping
    const postTagRows = await db.select().from(postTags)
    const tagMap = new Map<string, string[]>()
    for (const pt of postTagRows) {
      const list = tagMap.get(pt.postId) || []
      list.push(pt.tag)
      tagMap.set(pt.postId, list)
    }

    const paths = await postPaths(allPosts.map((post) => post.id))
    for (const p of allPosts) {
      if (filters?.status && filters.status !== 'all' && p.status !== filters.status) {
        continue
      }
      items.push({
        id: p.id,
        permalink: paths.get(p.id),
        title: p.title,
        slug: p.slug,
        content: p.content,
        excerpt: p.excerpt,
        status: p.status === 'published' ? 'publish' : p.status,
        type: 'post',
        date: p.publishedAt ? p.publishedAt.toISOString() : new Date().toISOString(),
        author: authorMap.get(p.authorId) || 'Admin',
        categories: catMap.get(p.id) || [],
        tags: tagMap.get(p.id) || [],
      })
    }
  }

  if (type === 'all' || type === 'pages') {
    const allPages = await db.select().from(pages)
    for (const pg of allPages) {
      items.push({
        id: pg.id,
        permalink: `/${pg.slug}`,
        title: pg.title,
        slug: pg.slug,
        content: pg.content,
        status: 'publish',
        type: 'page',
        date: pg.updatedAt ? pg.updatedAt.toISOString() : new Date().toISOString(),
        author: 'Admin',
      })
    }
  }

  const siteInfo = {
    title: settings.name || 'NextPress',
    url: settings.siteUrl || 'http://localhost:3000',
    description: settings.description || '',
  }

  const xml = exportWxr(items, siteInfo)
  const safeDate = new Date().toISOString().slice(0, 10)
  const safeName = slugify(settings.name || 'blog') || 'wordpress'
  const filename = `${safeName}.wordpress.${safeDate}.xml`

  return { xml, filename }
}

export async function importWxrData(
  xmlContent: string,
  dryRun = false,
): Promise<{ totalProcessed: number; importedCount: number; skippedCount: number }> {
  const session = await requireAdmin()
  const summary = importWxr(xmlContent, dryRun)

  if (dryRun || summary.items.length === 0) {
    return {
      totalProcessed: summary.totalProcessed,
      importedCount: 0,
      skippedCount: summary.totalProcessed,
    }
  }

  const db = getDb()
  let importedCount = 0
  let skippedCount = 0

  await db.transaction(async (tx) => {
    await lockContentStructure(tx)
    const userAuthor = await ensureUserAuthor(tx, session.user.id)
    const defaultCat = await ensureDefaultCategory(tx)

    for (const item of summary.items) {
      if (item.type === 'page') {
        const [existing] = await tx
          .select({ id: pages.id })
          .from(pages)
          .where(eq(pages.slug, item.slug))
          .limit(1)

        if (existing) {
          skippedCount++
          continue
        }

        const id = newId()
        const cleanContent = cleanHtml(item.content)
        await tx.insert(pages).values({
          id,
          title: item.title,
          slug: item.slug,
          content: cleanContent,
        })
        await projectPageToCore(tx, id)
        importedCount++
      } else {
        const [existing] = await tx
          .select({ id: posts.id })
          .from(posts)
          .where(eq(posts.slug, item.slug))
          .limit(1)

        if (existing) {
          skippedCount++
          continue
        }

        const id = newId()
        const cleanContent = cleanHtml(item.content)
        await tx.insert(posts).values({
          id,
          title: item.title,
          slug: item.slug,
          content: cleanContent,
          authorId: userAuthor.id,
          status: item.status === 'publish' ? 'published' : 'draft',
          publishedAt: new Date(),
        })

        await tx.insert(postCategories).values({
          postId: id,
          categoryId: defaultCat.id,
        })

        await projectPostToCore(tx, id)
        importedCount++
      }
    }
  })

  return {
    totalProcessed: summary.totalProcessed,
    importedCount,
    skippedCount,
  }
}

export async function importBloggerData(
  xmlContent: string,
  dryRun = false,
): Promise<BloggerImportSummary> {
  const session = await requireAdmin()
  const summary = parseBloggerXml(xmlContent, dryRun)

  if (dryRun || summary.items.length === 0) {
    return summary
  }

  const db = getDb()
  let importedCount = 0
  let skippedCount = 0

  await db.transaction(async (tx) => {
    await lockContentStructure(tx)
    const userAuthor = await ensureUserAuthor(tx, session.user.id)
    const defaultCat = await ensureDefaultCategory(tx)

    for (const item of summary.items) {
      if (item.type === 'page') {
        const [existing] = await tx
          .select({ id: pages.id })
          .from(pages)
          .where(eq(pages.slug, item.slug))
          .limit(1)

        if (existing) {
          skippedCount++
          continue
        }

        const id = newId()
        const cleanContent = cleanHtml(item.content)
        await tx.insert(pages).values({
          id,
          title: item.title,
          slug: item.slug,
          content: cleanContent,
        })
        await projectPageToCore(tx, id)
        importedCount++
      } else {
        const [existing] = await tx
          .select({ id: posts.id })
          .from(posts)
          .where(eq(posts.slug, item.slug))
          .limit(1)

        if (existing) {
          skippedCount++
          continue
        }

        const id = newId()
        const cleanContent = cleanHtml(item.content)
        await tx.insert(posts).values({
          id,
          title: item.title,
          slug: item.slug,
          content: cleanContent,
          authorId: userAuthor.id,
          status: item.status === 'published' ? 'published' : 'draft',
          publishedAt: new Date(item.publishedAt || Date.now()),
        })

        // Handle categories from Blogger labels
        const assignedCatIds: string[] = []
        for (const catName of item.categories) {
          const cleanName = catName.trim()
          if (!cleanName) continue
          const catSlug = slugify(cleanName) || `cat-${newId().slice(0, 6)}`
          const [foundCat] = await tx
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.slug, catSlug))
            .limit(1)

          if (foundCat) {
            assignedCatIds.push(foundCat.id)
          } else {
            const newCatId = newId()
            const [created] = await tx
              .insert(categories)
              .values({
                id: newCatId,
                name: cleanName,
                slug: catSlug,
                description: '',
              })
              .returning()
            if (created) assignedCatIds.push(created.id)
          }
        }

        if (assignedCatIds.length === 0) {
          assignedCatIds.push(defaultCat.id)
        }

        for (const catId of assignedCatIds) {
          await tx.insert(postCategories).values({
            postId: id,
            categoryId: catId,
          })
        }

        await projectPostToCore(tx, id)
        importedCount++
      }
    }
  })

  return {
    ...summary,
    importedCount,
    skippedCount,
  }
}
