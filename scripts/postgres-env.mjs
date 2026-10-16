export function postgresEnv(connectionString) {
  const url = new URL(connectionString)
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('A PostgreSQL connection URL is required.')
  const database = decodeURIComponent(url.pathname.slice(1))
  if (!url.hostname || !database) throw new Error('Database host and name are required.')
  return {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
    ...(url.searchParams.get('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode') } : {}),
    ...(url.searchParams.get('sslrootcert')
      ? { PGSSLROOTCERT: url.searchParams.get('sslrootcert') }
      : {}),
    ...(url.searchParams.get('options') ? { PGOPTIONS: url.searchParams.get('options') } : {}),
  }
}
