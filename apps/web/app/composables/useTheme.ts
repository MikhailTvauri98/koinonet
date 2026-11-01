import { useState } from '#imports'

export type Theme = 'dark' | 'light'

export function useTheme() {
  // Adopt the parser-blocking initializer, without re-reading device storage.
  const theme = useState<Theme>('ui.theme', () =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )

  function setTheme(value: Theme) {
    theme.value = value
    document.documentElement.dataset.theme = value
    document.documentElement.style.colorScheme = value
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'light' ? '#f5f6f9' : '#141719')
    try {
      window.localStorage.setItem('church.ui.theme', value)
    } catch {
      // A blocked device preference must not prevent changing the current page.
    }
  }

  return { theme, setTheme }
}
