/** Supported WordPress-style date tokens, formatted in the configured site timezone. */
export function formatSiteDate(
  value: string | Date,
  settings: { timezone: string; dateFormat: string },
) {
  const date = new Date(value)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('id-ID', {
      timeZone: settings.timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const tokens: Record<string, string> = {
    d: parts.day!,
    j: String(Number(parts.day)),
    m: parts.month!,
    n: String(Number(parts.month)),
    Y: parts.year!,
    y: parts.year!.slice(-2),
    F: new Intl.DateTimeFormat('id-ID', { timeZone: settings.timezone, month: 'long' }).format(
      date,
    ),
  }
  return settings.dateFormat.replace(
    /\\(.)|[djmnYyF]/g,
    (token, escaped: string | undefined) => escaped ?? tokens[token]!,
  )
}
