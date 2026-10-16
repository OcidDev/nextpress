import { z } from 'zod'
import { customThemeTemplateSchema } from './page-template-schema'

// Small, explicit theme.json v3 subset. Reject unsupported fields rather than
// silently reporting a successful installation whose styles will never apply.
const value = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9 #.,%()_'"/+-]+$/)
const slug = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)
const color = z.object({ background: value.optional(), text: value.optional() }).strict()
const typography = z
  .object({
    fontFamily: value.optional(),
    fontSize: value.optional(),
    lineHeight: value.optional(),
  })
  .strict()
export const themeJsonSchema = z
  .object({
    version: z.literal(3),
    customTemplates: z.array(customThemeTemplateSchema).max(30).optional(),
    settings: z
      .object({
        color: z
          .object({
            palette: z
              .array(z.object({ slug, name: z.string().max(100), color: value }).strict())
              .max(40)
              .optional(),
          })
          .strict()
          .optional(),
        typography: z
          .object({
            fontSizes: z
              .array(z.object({ slug, name: z.string().max(100), size: value }).strict())
              .max(30)
              .optional(),
            fontFamilies: z
              .array(z.object({ slug, name: z.string().max(100), fontFamily: value }).strict())
              .max(20)
              .optional(),
          })
          .strict()
          .optional(),
        layout: z
          .object({ contentSize: value.optional(), wideSize: value.optional() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    styles: z
      .object({
        color: color.optional(),
        typography: typography.optional(),
        elements: z
          .object({
            link: z.object({ color: color.optional() }).strict().optional(),
            heading: z
              .object({ color: color.optional(), typography: typography.optional() })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export function themeJsonCss(input: unknown): string {
  const theme = themeJsonSchema.parse(input)
  const vars: string[] = []
  for (const item of theme.settings?.color?.palette ?? [])
    vars.push(`--wp--preset--color--${item.slug}:${item.color}`)
  for (const item of theme.settings?.typography?.fontSizes ?? [])
    vars.push(`--wp--preset--font-size--${item.slug}:${item.size}`)
  for (const item of theme.settings?.typography?.fontFamilies ?? [])
    vars.push(`--wp--preset--font-family--${item.slug}:${item.fontFamily}`)
  for (const [key, val] of Object.entries(theme.settings?.layout ?? {}))
    vars.push(`--wp--style--root--${key === 'contentSize' ? 'content-size' : 'wide-size'}:${val}`)
  const declarations = (styles?: {
    color?: z.infer<typeof color>
    typography?: z.infer<typeof typography>
  }) => {
    const list: string[] = []
    if (styles?.color?.background) list.push(`background-color:${styles.color.background}`)
    if (styles?.color?.text) list.push(`color:${styles.color.text}`)
    if (styles?.typography?.fontFamily) list.push(`font-family:${styles.typography.fontFamily}`)
    if (styles?.typography?.fontSize) list.push(`font-size:${styles.typography.fontSize}`)
    if (styles?.typography?.lineHeight) list.push(`line-height:${styles.typography.lineHeight}`)
    return list.join(';')
  }
  return `:scope {${vars.join(';')};${declarations(theme.styles)}}\n:scope a {${declarations(theme.styles?.elements?.link)}}\n:scope h1,:scope h2,:scope h3,:scope h4,:scope h5,:scope h6 {${declarations(theme.styles?.elements?.heading)}}`
}
