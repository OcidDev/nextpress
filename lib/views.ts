import { z } from 'zod'

export function viewRequestOrigin(
  requestUrl: string,
  host: string | null,
  forwardedProto: string | null,
) {
  try {
    const url = new URL(requestUrl)
    const protocol =
      forwardedProto === 'http' || forwardedProto === 'https' ? `${forwardedProto}:` : url.protocol
    const hostname = host ?? url.host
    if (!['http:', 'https:'].includes(protocol) || !hostname || /[\s/@?#\\]/.test(hostname))
      return null
    const origin = new URL(`${protocol}//${hostname}`)
    return origin.hostname && !origin.username && !origin.password ? origin.origin : null
  } catch {
    return null
  }
}

export const viewInputSchema = z
  .object({
    path: z
      .string()
      .max(400)
      .regex(/^\/(?:(?:[a-zA-Z0-9_/%-]+(?:\/[a-zA-Z0-9_%-]+)*)|\?p=[a-f0-9]{32})?$/)
      .refine((path) => {
        try {
          return (
            !/%(?:2f|5c|00)/i.test(path) &&
            !/^\/(?:admin|preview|api)(?:\/|$)/.test(decodeURIComponent(path))
          )
        } catch {
          return false
        }
      }),
    postId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    site: z.boolean().default(false),
  })
  .strict()
  .refine((value) => value.site || value.postId, 'A page or article metric is required')

export const viewMetricSchema = z.string().regex(/^(?:site|post:[a-f0-9]{32})$/)
export const viewDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  )
export const viewCountSchema = z
  .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
  .refine((value) => Number.isSafeInteger(value) && value >= 0)
export function viewDelta(previous: number, current: number) {
  viewCountSchema.parse(previous)
  viewCountSchema.parse(current)
  return Math.max(0, current - previous)
}
export const VIEW_DAYS_KEY = 'views:v1:days'
export const viewDayKey = (day: string) => `views:v1:day:${viewDaySchema.parse(day)}`

// Limits and deduplication happen in the same atomic operation as the increments.
export const TRACK_VIEWS_SCRIPT = `
local rate = redis.call('INCR', KEYS[2])
if rate == 1 then redis.call('EXPIRE', KEYS[2], 600) end
if rate > 120 then return -1 end
local accepted = 0
for index = 3, #KEYS do
  if redis.call('SET', KEYS[index], '1', 'NX', 'EX', 1800) then
    redis.call('HSETNX', KEYS[1], '__batch', ARGV[1])
    redis.call('HINCRBY', KEYS[1], ARGV[index - 1], 1)
    accepted = accepted + 1
  end
end
if accepted > 0 then redis.call('SADD', '${VIEW_DAYS_KEY}', ARGV[#ARGV]) end
return accepted
`

export const READ_VIEW_SCAN_SCRIPT = `
local generation = redis.call('HGET', KEYS[1], '__batch')
local page = redis.call('HSCAN', KEYS[1], ARGV[1], 'COUNT', 100)
return {generation or '', page[1], page[2]}
`
