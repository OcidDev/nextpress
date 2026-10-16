import { z } from 'zod'
import { parseTemplate, templateSchema, type BlockNode } from './template'

export const customTemplateName = z.string().regex(/^[a-z][a-z0-9-]{0,59}$/)
export const customThemeTemplateSchema = z
  .object({
    name: customTemplateName,
    title: z.string().trim().min(1).max(100),
    postTypes: z.array(z.literal('page')).min(1).max(1).default(['page']),
  })
  .strict()
export const pluginPageTemplateSchema = z
  .object({
    id: customTemplateName,
    name: z.string().trim().min(1).max(100),
    template: templateSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const parsed = parseTemplate(value.template)
    if (!parsed.template)
      ctx.addIssue({ code: 'custom', message: 'Template laman plugin tidak valid.' })
    const walk = (nodes: BlockNode[]) => {
      for (const node of nodes) {
        // Plugins ship self-contained layouts; theme-specific parts cannot be assumed available.
        if (node.block === 'core/template-part' || node.block.startsWith('plugin/'))
          ctx.addIssue({
            code: 'custom',
            message: 'Template plugin harus memakai blok core mandiri, tanpa referensi part.',
          })
        if (node.children) walk(node.children)
      }
    }
    walk(value.template.blocks)
  })
export type PageTemplateChoice = { value: string; label: string; source: string }
