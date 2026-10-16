import type { Config } from 'drizzle-kit'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

export default {
  schema: [
    './lib/db/schema.ts',
    './lib/db/auth-schema.ts',
    './lib/db/core-schema.ts',
    './lib/db/data-schema.ts',
    './lib/db/operations-schema.ts',
    './lib/db/preferences-schema.ts',
    './lib/db/views-schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
} satisfies Config
