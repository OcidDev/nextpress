import { z } from 'zod'

const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)
const label = z.string().min(1).max(100)
const base = { id, label, group: z.enum(['Warna', 'Tipografi', 'Tata letak']) }
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
// Select values become CSS tokens, never arbitrary CSS declarations or URLs.
const token = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9 ,.'"-]+$/)
const controlSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('color'), default: color }).strict(),
  z
    .object({
      ...base,
      type: z.literal('range'),
      default: z.number(),
      min: z.number().min(0),
      max: z.number().max(2400),
      step: z.number().positive(),
      unit: z.enum(['px', 'rem', '']).default(''),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('select'),
      default: token,
      options: z
        .array(z.object({ label, value: token }).strict())
        .min(1)
        .max(20),
    })
    .strict(),
])
const valuesSchema = z.record(id, z.union([z.string().max(160), z.number().finite()]))
export const customizationSchema = z
  .object({
    version: z.literal(1),
    controls: z.array(controlSchema).min(1).max(30),
    presets: z
      .array(z.object({ id, name: label, values: valuesSchema }).strict())
      .max(20)
      .default([]),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (
      new Set(config.controls.map((c) => c.id)).size !== config.controls.length ||
      new Set(config.presets.map((p) => p.id)).size !== config.presets.length
    )
      ctx.addIssue({ code: 'custom', message: 'ID pengaturan atau variasi tema duplikat.' })
    for (const control of config.controls) {
      if (
        !validValue(control, control.default) ||
        (control.type === 'range' && control.min > control.max)
      )
        ctx.addIssue({ code: 'custom', message: `Default ${control.id} tidak valid.` })
    }
    for (const preset of config.presets)
      for (const [key, value] of Object.entries(preset.values)) {
        const control = config.controls.find((c) => c.id === key)
        if (!control || !validValue(control, value))
          ctx.addIssue({ code: 'custom', message: `Variasi ${preset.id}: ${key} tidak valid.` })
      }
  })
export type ThemeCustomization = z.infer<typeof customizationSchema>
export type ThemeValues = z.infer<typeof valuesSchema>
export type ThemeControl = z.infer<typeof controlSchema>
function validValue(control: ThemeControl, value: unknown) {
  if (control.type === 'color') return color.safeParse(value).success
  if (control.type === 'select') return control.options.some((o) => o.value === value)
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= control.min &&
    value <= control.max &&
    Math.abs(
      (value - control.min) / control.step - Math.round((value - control.min) / control.step),
    ) < 0.00001
  )
}
export function validateThemeValues(config: ThemeCustomization, input: unknown): ThemeValues {
  const values = valuesSchema.parse(input)
  for (const [key, value] of Object.entries(values)) {
    const control = config.controls.find((c) => c.id === key)
    if (!control || !validValue(control, value))
      throw new Error(`Pengaturan ${key} tidak didukung tema ini.`)
  }
  return values
}
/** Package updates may remove controls. Keep stored values, use only compatible values at render. */
export function resolveThemeValues(
  config: ThemeCustomization,
  saved: ThemeValues = {},
): ThemeValues {
  return Object.fromEntries(
    config.controls.map((c) => [c.id, validValue(c, saved[c.id]) ? saved[c.id]! : c.default]),
  )
}
export function themeCustomizationStyle(config: ThemeCustomization, saved: ThemeValues = {}) {
  const values = resolveThemeValues(config, saved)
  return Object.fromEntries(
    config.controls.map((c) => [
      `--theme--custom--${c.id}`,
      `${values[c.id]}${c.type === 'range' ? c.unit : ''}`,
    ]),
  )
}
export const themeCustomizationStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  active: valuesSchema,
  draft: valuesSchema.nullable(),
})
export type ThemeCustomizationState = z.infer<typeof themeCustomizationStateSchema>
export const emptyCustomizationState = (): ThemeCustomizationState => ({
  revision: 0,
  active: {},
  draft: null,
})
