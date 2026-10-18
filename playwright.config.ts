import { defineConfig } from '@playwright/test'

if (!process.env.TEST_DATABASE_URL)
  throw new Error('Set TEST_DATABASE_URL to an isolated, migrated test database.')
const baseURL = 'http://localhost:3109'

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'off', // Login traces contain test credentials; never record real accounts.
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: {
    command: 'pnpm exec next start -p 3109',
    url: `${baseURL}/admin/login`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: 'isolated-security-tests-only-not-a-production-secret',
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXTPRESS_CLIENT_IP_HEADER: 'x-real-ip',
    },
  },
})
