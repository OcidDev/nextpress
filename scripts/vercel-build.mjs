import { execFileSync } from 'node:child_process'

// Vercel builds are the only place this installation can describe itself: the
// runtime is immutable, so migrations must be applied before the new build is
// promoted. Runs on every deployment, but only touches the database when the
// deployment targets production — a preview build must never migrate.
const production = process.env.VERCEL_ENV === 'production'

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', env: process.env })
}

if (production) {
  // Migrations are written to be additive so the previous build can keep
  // serving while this one builds. A migration that fails stops the deployment.
  run('pnpm', ['db:migrate'])
  run('pnpm', ['db:check'])
} else {
  console.log('[vercel-build] Bukan deployment produksi; migrasi dilewati.')
}

run('pnpm', ['build'])
