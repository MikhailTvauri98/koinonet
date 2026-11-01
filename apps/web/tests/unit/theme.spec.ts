// @vitest-environment nuxt
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState } from '#imports'

const scriptPath = resolve(process.cwd(), 'public/theme-init.js')

function initializeTheme() {
  // An absent initializer leaves the browser unchanged, just as on first entry.
  const script = existsSync(scriptPath) ? readFileSync(scriptPath, 'utf8') : ''
  window.eval(script)
}

beforeEach(() => {
  vi.restoreAllMocks()
  clearNuxtState('ui.theme')
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
  document.head.innerHTML = '<meta name="theme-color" content="#141719">'
})

describe('theme shared by the client', () => {
  it('adopts the first frame and shares changes between consumers and reload', async () => {
    localStorage.setItem('church.ui.theme', 'light')
    initializeTheme()
    const { useTheme } = await import('~/composables/useTheme')
    const first = useTheme()
    const second = useTheme()
    expect(first.theme.value).toBe('light')
    first.setTheme('dark')
    expect(second.theme.value).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#141719')
    expect(localStorage.getItem('church.ui.theme')).toBe('dark')
    first.setTheme('light')
    clearNuxtState('ui.theme')
    initializeTheme()
    expect(useTheme().theme.value).toBe('light')
  })

  it('still changes theme when saving on the device is blocked', async () => {
    initializeTheme()
    const { useTheme } = await import('~/composables/useTheme')
    const { theme, setTheme } = useTheme()
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(() => setTheme('light')).not.toThrow()
    expect(theme.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f5f6f9')
  })
})

describe('theme before application startup', () => {
  it('defaults to dark without consulting a light operating system', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    initializeTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#141719')
  })

  it('applies saved light before application startup', () => {
    localStorage.setItem('church.ui.theme', 'light')
    initializeTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f5f6f9')
  })

  it.each(['system', 'DARK', '', 'undefined'])('uses dark for invalid stored value %j', (value) => {
    localStorage.setItem('church.ui.theme', value)
    initializeTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('keeps dark available when storage access throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(initializeTheme).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
