import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mockVisualApi } from './support/api'

// Prerequisite: npm run generate. First-frame tests intentionally read the
// current .output/public build; regenerate after any source/config change.
for (const scenario of ['dark', 'light', 'invalid saved value', 'blocked storage'] as const) {
  const theme = scenario === 'light' ? 'light' : 'dark'
  test(`generated first styled frame is ${theme} with ${scenario} before application startup`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.emulateMedia({ colorScheme: 'light' })
    if (theme === 'light') await page.addInitScript(() => localStorage.setItem('church.ui.theme', 'light'))
    if (scenario === 'invalid saved value') await page.addInitScript(() => localStorage.setItem('church.ui.theme', 'system'))
    if (scenario === 'blocked storage') await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage unavailable', 'SecurityError') } })
    })
    // Serve actual generated HTML/CSS: dev CSS is injected by application JS,
    // which cannot prove the appearance before that JS is allowed to start.
    await page.route('**/*', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (route.request().resourceType() === 'script' && path !== '/theme-init.js') return route.abort()
      const file = path === '/login' ? 'index.html' : path.slice(1)
      const body = await readFile(resolve(process.cwd(), '.output/public', file))
      return route.fulfill({ body, contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript' })
    })
    await page.goto('/login', { waitUntil: 'load' })
    if (scenario === 'blocked storage') expect(await page.evaluate(() => { try { void window.localStorage; return false } catch { return true } })).toBe(true)
    if (scenario === 'invalid saved value') expect(await page.evaluate(() => localStorage.getItem('church.ui.theme'))).toBe('system')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('html')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(20, 23, 25)' : 'rgb(245, 246, 249)')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', theme === 'dark' ? '#141719' : '#f5f6f9')
    const initializer = page.locator('script[src="/theme-init.js"]')
    expect(await initializer.evaluate((script) => {
      const css = document.querySelector('link[rel="stylesheet"]')!
      return Boolean(script.compareDocumentPosition(css) & Node.DOCUMENT_POSITION_FOLLOWING)
        && !(script as HTMLScriptElement).defer && !(script as HTMLScriptElement).async
    })).toBe(true)
    expect(errors, 'the initializer handles device storage without an uncaught exception').toEqual([])
  })
}

for (const theme of ['dark', 'light'] as const) {
  test(`${theme} theme survives startup and reload on both screen sizes`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
    await mockVisualApi(page, true)
    await page.goto('/login?passwordChanged=1')
    await expect(page.getByRole('heading', { name: 'Вход', exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('html')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(20, 23, 25)' : 'rgb(245, 246, 249)')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Вход', exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', theme === 'dark' ? '#141719' : '#f5f6f9')
    const contrast = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement)
      function luminance(token: string) {
        const hex = styles.getPropertyValue(token).trim().slice(1)
        const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
          .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
      }
      function ratio(foreground: string, background: string) {
        const first = luminance(foreground), second = luminance(background)
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
      }
      const surfaces = ['--ui-canvas', '--ui-navigation', '--ui-surface', '--ui-surface-muted', '--ui-accent-soft']
      return {
        text: surfaces.flatMap(surface => ['--ui-text', '--ui-text-muted', '--ui-accent', '--ui-accent-hover', '--ui-danger', '--ui-success'].map(text => ({ text, surface, ratio: ratio(text, surface) }))),
        button: ['--ui-accent', '--ui-accent-hover'].map(surface => ratio('--ui-on-accent', surface)),
        focus: surfaces.map(surface => ratio('--ui-focus', surface)),
      }
    })
    for (const pair of contrast.text) expect(pair.ratio, `${pair.text} on ${pair.surface}`).toBeGreaterThanOrEqual(4.5)
    for (const ratio of contrast.button) expect(ratio).toBeGreaterThanOrEqual(4.5)
    for (const ratio of contrast.focus) expect(ratio).toBeGreaterThanOrEqual(3)
    await expect(page.locator('button[type="submit"]')).toHaveCSS('color', theme === 'dark' ? 'rgb(20, 33, 59)' : 'rgb(255, 255, 255)')
    await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const input = page.getByLabel('Телефон или email', { exact: true })
      await input.focus()
      await expect(input).toHaveCSS('outline-style', 'solid')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: info.outputPath(`login-${theme}-${width}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 320, height: 568 })
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
    await page.getByLabel('Телефон или email', { exact: true }).fill('long.account.name.with.many.parts@example.test')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.getByRole('button', { name: 'Войти', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`login-${theme}-320-text-200.png`), fullPage: true })
  })
}
