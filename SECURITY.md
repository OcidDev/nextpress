# Security policy

Security fixes target the latest release. Older releases are not maintained as
separate security branches. Installations predating the login-form fix must be
updated before use on the public internet.

## Reporting a vulnerability

Please do not put passwords, session cookies, database URLs, or exploit details
in public issues. Use [GitHub private vulnerability reporting](https://github.com/OcidDev/nextpress/security/advisories/new),
which is enabled for this repository. If it is unavailable, ask the maintainer
for a private reporting channel without publishing the vulnerability details.

Include the affected version, a minimal reproduction using dummy accounts,
expected and actual behavior, and impact. Never include another person's data.

## Deployment requirements

- Serve the public installation over HTTPS. Set `BETTER_AUTH_URL` and
  `NEXT_PUBLIC_SITE_URL` to the same public origin, and generate a unique random
  `BETTER_AUTH_SECRET` of at least 32 characters.
- Keep the application port private behind the trusted ingress. Set
  `NEXTPRESS_CLIENT_IP_HEADER` to a header the ingress **overwrites** with one
  verified client IP. The default is `x-real-ip`; Vercel installations should use
  `x-forwarded-for`. Do not pass a client-provided value or append to it.
- Missing or invalid IPs share a rate-limit bucket. Never disable limiting to
  work around a proxy configuration error. Distributed attacks still require
  controls at the ingress/provider layer.
- Never log authentication request bodies, cookies, or authorization headers.
  Limit access to proxy/application logs and backups. Keep secrets out of Git.
- Uploaded media are public by URL, including images attached to unpublished
  content. This library is not private document storage.
- ZIP plugins execute in sandboxed frames; their settings are visible to their
  JavaScript and must not contain secrets. Compiled server extensions are trusted
  code with server privileges and must be reviewed before deployment.
- Apply migrations after a backup, test restoring into a separate database, and
  verify login, cookie flags, role restrictions and limits on the actual host.

## Credentials previously present in a URL

Treat the affected password as exposed. After deploying the fix, reset it using
the corrected CLI or profile form; both revoke existing sessions. Rotate it on
other services if reused. Remove affected entries from browser history, shared
screenshots, and proxy/hosting logs under your control. A redirect cannot erase
values already captured upstream. Also rotate any password set by the old reset
script's built-in fallback; removing that fallback does not change stored hashes.

## Verification

Run `pnpm test:security`, `pnpm test:db`, `pnpm test:e2e` against an isolated database, lint,
typecheck, production build, migration checks, and `pnpm audit --prod` before
release. Run full `pnpm audit` as well and review development-tool findings; do
not mistake a clean production dependency audit for a complete security audit.
