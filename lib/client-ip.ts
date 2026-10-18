import { isIP } from 'node:net'

// The ingress must overwrite this header, and the app port must not be public.
// Never take the first token of a client-supplied forwarded chain.
export function clientIpHeader() {
  const name = process.env.NEXTPRESS_CLIENT_IP_HEADER?.trim().toLowerCase() || 'x-real-ip'
  if (!['x-real-ip', 'x-forwarded-for', 'cf-connecting-ip'].includes(name))
    throw new Error('NEXTPRESS_CLIENT_IP_HEADER tidak didukung')
  return name
}

export function clientIp(headers: Pick<Headers, 'get'>) {
  const value = headers.get(clientIpHeader())?.trim() || ''
  // Missing/ambiguous IPs share a bucket instead of disabling abuse controls.
  return isIP(value) ? value : 'unknown'
}
