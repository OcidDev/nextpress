'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/admin'
import { changeThemeCustomization } from '@/lib/themes/customization-server'

const inputSchema = z
  .object({
    activeThemeId: z.string().optional(),
    themeId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().nonnegative(),
    operation: z.enum(['save', 'apply', 'discard']),
    values: z.unknown().optional(),
  })
  .strict()
export async function customizeTheme(input: z.infer<typeof inputSchema>) {
  await requireCapability('edit_theme_options')
  try {
    const parsed = inputSchema.parse(input)
    const state = await changeThemeCustomization(parsed)
    revalidatePath('/admin/appearance/customize')
    if (parsed.operation === 'apply') revalidatePath('/', 'layout')
    return { state }
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? 'Pengaturan tema tidak valid.'
          : error instanceof Error
            ? error.message
            : 'Pengaturan belum dapat disimpan.',
    }
  }
}
