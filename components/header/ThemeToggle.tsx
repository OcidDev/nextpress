'use client'
// client
import { MoonSunIcon } from '@/components/ui/icons/MoonSunIcon'
import { Modal } from '@/components/ui/Modal'
import { themeOptions } from '@/data/themes'
import { useTheme } from '@/hooks/useTheme'
import { openPanel } from '@/lib/ui-events'
import type { ThemeMode } from '@/types'
import styles from './ThemeToggle.module.css'

const modes: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Terang' },
  { value: 'dark', label: 'Gelap' },
  { value: 'system', label: 'Sistem' },
]

export function ThemeToggle() {
  const { mode, theme, setMode, setTheme } = useTheme()
  return (
    <>
      <button
        type="button"
        className="iconButton"
        aria-label="Atur tampilan"
        aria-haspopup="dialog"
        aria-controls="panel-theme"
        onClick={() => openPanel('theme')}
      >
        <MoonSunIcon aria-hidden="true" />
      </button>
      <Modal panel="theme" title="Tampilan">
        <fieldset className={styles.fieldset}>
          <legend>Mode tampilan</legend>
          <div className={styles.modes}>
            {modes.map((item) => (
              <label key={item.value}>
                <input
                  type="radio"
                  name="mode"
                  value={item.value}
                  checked={mode === item.value}
                  onChange={() => setMode(item.value)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend>Warna tema</legend>
          <div className={styles.swatches}>
            {themeOptions.map((item) => (
              <label key={item.id} title={item.label}>
                <input
                  type="radio"
                  name="theme"
                  value={item.id}
                  checked={theme === item.id}
                  onChange={() => setTheme(item.id)}
                  aria-label={item.label}
                />
                <span style={{ backgroundColor: item.swatch }} aria-hidden="true" />
                <span className="srOnly">{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Modal>
    </>
  )
}
