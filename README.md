# NextPress

An open source content management system built with Next.js, TypeScript,
PostgreSQL, Drizzle ORM, and Better Auth.

## Features

- Articles and pages with a rich text editor, image alignment, and sizing.
- Media library, categories, tags, and comment moderation.
- User accounts with capability-based access control.
- Configurable permalinks, automatic metadata, sitemap, and RSS.
- Reading, discussion, and integration settings managed from the admin.
- **Theme engine** — install ZIP theme packages, switch the active theme, and
  edit templates, template parts, and global styles from the site editor and
  customizer.
- **Plugin engine** — install ZIP plugin packages that contribute sandboxed
  widget areas and page templates.

The default theme is Twenty Twenty-Four.

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

## Themes and plugins

Install and manage packages from `/admin/appearance` (themes) and
`/admin/plugins` (plugins). Both take ZIP packages built to the format in
`lib/themes/package.ts` and `lib/plugins/manifest.ts`. A newly installed package
starts inactive so its widget placements can be arranged before it goes live.

Widget code runs inside a sandboxed iframe. Plugin JavaScript cannot reach the
host page or the server.

A plugin may also declare a **server-side** extension, such as `contentSeo`. That
kind of extension only runs when its module is compiled into the build and
registered by id in `lib/plugins/content-seo-server.ts`. Installing the package
alone registers its settings and widgets but contributes no server-side
behaviour. No server-side runtime ships with the CMS, so that registry is empty
and its features stay dormant until one is added.

To package a theme or plugin for distribution:

```bash
pnpm theme:pack
pnpm plugin:pack <source-dir> <output.zip>
```

`theme:pack` rebuilds `lib/themes/bundled.generated.json` from the theme folders
under `examples/themes`. It refuses to run when there are no source folders,
because writing an empty bundle would remove the default theme.

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
table definitions under `lib/db`; `drizzle.config.ts` points at the barrel
`lib/db/schema.ts`, which re-exports every schema file:

```bash
pnpm db:generate
pnpm db:backup /path/to/backup.dump
pnpm db:restore /path/to/backup.dump
```

## Project layout

| Path                | Contents                                                   |
| ------------------- | ---------------------------------------------------------- |
| `app/`              | Routes: public site, admin, API handlers, feeds, sitemap.   |
| `components/`       | Site, admin, editor, and UI components.                     |
| `components/theme/` | Components that render the active theme's chrome.           |
| `lib/core/`         | Content, terms, meta, options, roles, and tools.            |
| `lib/db/`           | Drizzle schemas, migrations, and queries.                   |
| `lib/themes/`       | Theme packages, templates, styles, and the customizer.      |
| `lib/plugins/`      | Plugin packages, manifests, and server-side runtimes.       |
| `lib/blocks/`       | Block system used by theme and page templates.              |
| `lib/extensions/`   | Hook kernel and capability bridge.                          |
| `server/actions/`   | Server actions used by admin forms.                         |
| `data/`             | Site defaults: navigation, footer, social links, config.    |
