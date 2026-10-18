// Read-only smoke checks. Never sends credentials or modifies hosted content.
import app from '../package.json' with { type: 'json' }

const input = process.argv[2]
if (!input) throw new Error('Usage: pnpm release:verify https://your-nextpress-host.example')
const base = new URL(input)
if (
  base.protocol !== 'https:' ||
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.pathname !== '/'
)
  throw new Error('Provide an HTTPS origin without credentials, path or query.')

let failures = 0
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`)
  if (!condition) failures++
}
async function get(path) {
  return fetch(new URL(path, base), {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
}
const version = await get('/api/version')
const installed = await version.json().catch(() => ({}))
check(version.ok && installed.version === app.version, `public version matches ${app.version}`)
const login = await get('/admin/login')
const html = await login.text()
check(login.status === 200, 'login page is reachable')
check(
  /<form\b[^>]*method="post"[^>]*action="\/api\/auth\/sign-in\/email"/i.test(html),
  'login form uses POST before JavaScript',
)
check(
  /no-store/i.test(login.headers.get('cache-control') || ''),
  'admin response cannot be stored in caches',
)
check(login.headers.get('referrer-policy') === 'no-referrer', 'admin referrer is suppressed')
check(
  /max-age=[1-9]\d*/i.test(login.headers.get('strict-transport-security') || ''),
  'HTTPS HSTS is present',
)
check(login.headers.get('x-content-type-options') === 'nosniff', 'MIME sniffing is disabled')
for (const path of ['/admin', '/admin/users', '/api/admin/media']) {
  const response = await get(path)
  const location = response.headers.get('location')
  check(
    [303, 307].includes(response.status) &&
      location &&
      new URL(location, base).pathname === '/admin/login',
    `anonymous access denied: ${path}`,
  )
}
for (const path of ['/api/posts?preview=1', '/api/cron/flush-views']) {
  const response = await get(path)
  check(response.status === 401, `anonymous access denied: ${path}`)
}
console.log(
  'Authenticated cookies, trusted ingress IPs, Redis and deployment-provider permissions require separate environment verification.',
)
process.exitCode = failures ? 1 : 0
