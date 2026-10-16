'use client'
import { useEffect } from 'react'
import {
  themeCustomizationStyle,
  validateThemeValues,
  type ThemeCustomization,
} from '@/lib/themes/customization'

export function ThemeLivePreview({
  themeId,
  config,
}: {
  themeId: string
  config: ThemeCustomization
}) {
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== parent ||
        event.data?.type !== 'cms-theme-preview' ||
        event.data.themeId !== themeId
      )
        return
      try {
        const values = validateThemeValues(config, event.data.values)
        const root = document.querySelector<HTMLElement>('[data-theme-package]')
        for (const [key, value] of Object.entries(themeCustomizationStyle(config, values)))
          root?.style.setProperty(key, value)
      } catch {
        /* Invalid preview messages never change the document. */
      }
    }
    window.addEventListener('message', receive)
    parent.postMessage({ type: 'cms-theme-preview-ready', themeId }, location.origin)
    return () => window.removeEventListener('message', receive)
  }, [themeId, config])
  return null
}
