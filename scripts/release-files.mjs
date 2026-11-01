/** Files that must never enter a source release, even when force-added to Git. */
export function unsafeReleasePaths(paths) {
  const forbidden = [
    /(^|\/)\.env(\.|$)/,
    /(^|\/)\.(?:local|vercel|next)(\/|$)/,
    /(^|\/)node_modules(\/|$)/,
    /(^|\/)(?:backups?|dumps?|test-results|playwright-report)(\/|$)/,
    /\.(?:pem|key|p12|pfx|dump|backup)$/i,
    /(^|\/)tsconfig\.tsbuildinfo$/,
  ]
  return paths.filter(
    (path) => path !== '.env.example' && forbidden.some((rule) => rule.test(path)),
  )
}
