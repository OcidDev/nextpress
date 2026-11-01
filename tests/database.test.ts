import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { initialRoles } from '../lib/core/roles'

const run = promisify(execFile)
const id = () => randomBytes(16).toString('hex')
const ephemeral = ['cms_session', 'cms_verification', 'cms_rate_limit', 'cms_comment_limits']

async function snapshot(pool: Pool) {
  const tables = (
    await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  ).rows
  const result: Record<string, unknown> = {}
  for (const { tablename } of tables) {
    if (ephemeral.includes(tablename)) continue
    assert.match(tablename, /^[a-z_]+$/)
    result[tablename] = (
      await pool.query(
        `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') AS data FROM "${tablename}" t`,
      )
    ).rows[0].data
  }
  return result
}

test(
  'populated database upgrades preserve data; backup restores data but never sessions',
  { timeout: 120_000 },
  async () => {
    assert.ok(
      process.env.TEST_DATABASE_URL,
      'TEST_DATABASE_URL is required; use an isolated PostgreSQL server with CREATEDB permission',
    )
    const control = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
    const suffix = randomBytes(6).toString('hex')
    const names = [`nextpress_upgrade_${suffix}`, `nextpress_restore_${suffix}`]
    const temp = await mkdtemp(join(tmpdir(), 'nextpress-db-test-'))
    const pools: Pool[] = []
    try {
      for (const name of names) await control.query(`CREATE DATABASE "${name}"`)
      const urls = names.map((name) => {
        const url = new URL(process.env.TEST_DATABASE_URL!)
        url.pathname = `/${name}`
        return url.toString()
      })
      const source = new Pool({ connectionString: urls[0] }),
        restored = new Pool({ connectionString: urls[1] })
      pools.push(source, restored)
      const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'))
      const baseline = join(temp, 'baseline')
      await mkdir(join(baseline, 'meta'), { recursive: true })
      await writeFile(
        join(baseline, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
      )
      await copyFile(
        `drizzle/${journal.entries[0].tag}.sql`,
        join(baseline, `${journal.entries[0].tag}.sql`),
      )
      await migrate(drizzle(source), { migrationsFolder: baseline })

      const userId = id(),
        authorId = id(),
        postId = id(),
        pageId = id(),
        mediaId = id()
      await source.query('INSERT INTO cms_user(id,name,email,role) VALUES($1,$2,$3,$4)', [
        userId,
        'Restore fixture',
        'restore@example.test',
        'administrator',
      ])
      await source.query('INSERT INTO authors(id,user_id,slug,name) VALUES($1,$2,$3,$4)', [
        authorId,
        userId,
        'restore-author',
        'Restore author',
      ])
      await source.query(
        'INSERT INTO posts(id,slug,title,content,author_id,status) VALUES($1,$2,$3,$4,$5,$6)',
        [
          postId,
          'restore-post',
          'Preserve article',
          '<p>Preserved body</p>',
          authorId,
          'published',
        ],
      )
      await source.query('INSERT INTO pages(id,slug,title,content) VALUES($1,$2,$3,$4)', [
        pageId,
        'restore-page',
        'Preserve page',
        '<p>Published before page statuses existed</p>',
      ])
      const mediaBytes = randomBytes(128)
      await source.query(
        "INSERT INTO cms_media(id,name,mime_type,size,width,height,data,uploaded_by) VALUES($1,'fixture.webp','image/webp',$2,1,1,$3,$4)",
        [mediaId, mediaBytes.length, mediaBytes, userId],
      )
      const oldRoles = initialRoles()
      oldRoles.administrator!.capabilities = oldRoles.administrator!.capabilities.filter(
        (cap) => !['delete_themes', 'update_core'].includes(cap),
      )
      oldRoles.custom_editor = { label: 'Custom editor', capabilities: ['read', 'edit_posts'] }
      await source.query(
        "INSERT INTO cms_options(name,value) VALUES('core:roles',$1),('site',$2) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
        [JSON.stringify(oldRoles), JSON.stringify({ name: 'Preserved site configuration' })],
      )
      await source.query(
        "INSERT INTO cms_theme_packages(id,hash,files) VALUES('restore-theme',$1,$2)",
        ['a'.repeat(64), JSON.stringify({ 'theme.json': Buffer.from('{}').toString('base64') })],
      )
      await source.query(
        "INSERT INTO cms_plugins(id,manifest,files,package_hash,config) VALUES('restore-plugin',$1,$2,$3,$4)",
        [
          JSON.stringify({ id: 'restore-plugin' }),
          JSON.stringify({ 'index.html': '<p>Preserved widget</p>' }),
          'b'.repeat(64),
          JSON.stringify({ settings: {}, placements: [] }),
        ],
      )

      await migrate(drizzle(source), { migrationsFolder: 'drizzle' })
      await run(process.execPath, ['scripts/check-db-migrations.mjs'], {
        env: { ...process.env, DATABASE_URL: urls[0]! },
      })
      assert.equal(
        (await source.query('SELECT status FROM pages WHERE id=$1', [pageId])).rows[0].status,
        'published',
      )
      assert.equal(
        (await source.query('SELECT content FROM posts WHERE id=$1', [postId])).rows[0].content,
        '<p>Preserved body</p>',
      )
      const roles = (await source.query("SELECT value FROM cms_options WHERE name='core:roles'"))
        .rows[0].value
      assert.ok(roles.administrator.capabilities.includes('delete_themes'))
      assert.ok(roles.administrator.capabilities.includes('update_core'))
      assert.deepEqual(roles.custom_editor, oldRoles.custom_editor)
      const upgraded = await snapshot(source)
      await migrate(drizzle(source), { migrationsFolder: 'drizzle' })
      assert.deepEqual(await snapshot(source), upgraded, 'Rerunning migrations must be idempotent')
      await source.query(
        "INSERT INTO cms_editor_revisions(id,kind,content_id,author_id,snapshot) VALUES($1,'pages',$2,$3,$4)",
        [id(), pageId, userId, JSON.stringify({ title: 'Preserved revision' })],
      )
      await source.query(
        "INSERT INTO cms_session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
        [id(), id(), userId],
      )
      await source.query(
        "INSERT INTO cms_verification(id,identifier,value,expires_at) VALUES($1,'fixture','secret',now()+interval '1 day')",
        [id()],
      )
      await source.query(
        "INSERT INTO cms_rate_limit(id,key,count,last_request) VALUES($1,'fixture',1,1)",
        [id()],
      )
      await source.query(
        "INSERT INTO cms_comment_limits(key,count,reset_at) VALUES('fixture',1,now())",
      )

      const backup = join(temp, 'backup.dump')
      const backupEnv = { ...process.env, DATABASE_URL: urls[0]! }
      await run(process.execPath, ['scripts/backup-db.mjs', backup], { env: backupEnv })
      assert.equal((await stat(backup)).mode & 0o777, 0o600)
      await assert.rejects(
        run(process.execPath, ['scripts/backup-db.mjs', backup], { env: backupEnv }),
        'Backup must not overwrite an existing file',
      )
      const restoreEnv = { ...process.env, RESTORE_DATABASE_URL: urls[1]! }
      await assert.rejects(
        run(process.execPath, ['scripts/restore-db.mjs', backup, 'wrong-database'], {
          env: restoreEnv,
        }),
      )
      await run(process.execPath, ['scripts/restore-db.mjs', backup, names[1]!], {
        env: restoreEnv,
      })
      assert.deepEqual(
        await snapshot(restored),
        await snapshot(source),
        'All persistent tables must match byte-for-byte in their JSON representation',
      )
      assert.deepEqual(
        (await restored.query('SELECT data FROM cms_media WHERE id=$1', [mediaId])).rows[0].data,
        mediaBytes,
      )
      for (const table of ephemeral)
        assert.equal(
          (await restored.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n,
          0,
        )
      await run(process.execPath, ['scripts/check-db-migrations.mjs'], {
        env: { ...process.env, DATABASE_URL: urls[1]! },
      })
      // Restoring into a populated target must also discard sessions created there.
      await restored.query(
        "INSERT INTO cms_session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
        [id(), id(), userId],
      )
      await run(process.execPath, ['scripts/restore-db.mjs', backup, names[1]!], {
        env: restoreEnv,
      })
      assert.equal(
        (await restored.query('SELECT count(*)::int AS n FROM cms_session')).rows[0].n,
        0,
      )
    } finally {
      await Promise.all(pools.map((pool) => pool.end()))
      for (const name of names) await control.query(`DROP DATABASE IF EXISTS "${name}"`)
      await control.end()
      await rm(temp, { recursive: true, force: true })
    }
  },
)
