# NextPress

An open source content management system built with Next.js, TypeScript,
PostgreSQL, Drizzle ORM, and Better Auth.

## Features

- Articles and pages with a rich text editor, image alignment, and sizing.
- Media library, categories, tags, and comment moderation.
- User accounts with capability-based access control.
- Configurable permalinks, automatic metadata, sitemap, and RSS.
- Reading, discussion, and integration settings managed from the admin.

## Local setup

Requires Node.js 22 or newer, pnpm 11, and PostgreSQL.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `BETTER_AUTH_URL`, and
`BETTER_AUTH_SECRET` in `.env.local`. Use the same origin for both site and auth
URLs. Generate a secret with `openssl rand -hex 32`.

```bash
pnpm db:migrate
pnpm admin:create
pnpm dev
```

Open http://localhost:3000. Sign in at `/admin/login` using the administrator
account you created. There are no default credentials. Redis and analytics
integrations are optional; see `.env.example` for their settings.

## Validation and production build

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

Configure environment variables and apply database migrations before deploying.
Run these checks and manually verify changed workflows. No automated test suite
is included.

## Database

Migrations live in `drizzle/` and are applied with:

```bash
pnpm db:migrate
pnpm db:check
```

Back up an existing installation before applying new migrations, and keep
previously applied migration files unchanged. Generated migrations come from the
table definitions under `lib/db`; `drizzle.config.ts` lists every schema file:

```bash
pnpm db:generate
pnpm db:backup /path/to/backup.dump
pnpm db:restore /path/to/backup.dump
```

## Project layout

| Path             | Contents                                                  |
| ---------------- | --------------------------------------------------------- |
| `app/`           | Routes: public site, admin, API handlers, feeds, sitemap. |
| `components/`    | Site, admin, editor, and UI components.                   |
| `lib/core/`      | Content, terms, meta, options, roles, and tools.          |
| `lib/db/`        | Drizzle schemas, migrations, and queries.                 |
| `server/actions/`| Server actions used by admin forms.                       |
| `data/`          | Site defaults: navigation, footer, social links, config.  |
