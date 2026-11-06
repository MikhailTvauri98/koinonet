import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { mockVisualApi } from './support/api'
import { generatedSite } from './support/generated-site'

// Missing registration, a worker that fails installation, clearing device
// preferences on update or a broken initializer must fail this real browser path.
for (const theme of ['dark', 'light'] as const) {
  test(`generated PWA update keeps ${theme} after actual controller replacement`, async ({ browser }, info) => {
    test.setTimeout(90_000)
    const site = await generatedSite()
    const context = await browser.newContext({ baseURL: site.origin, serviceWorkers: 'allow', viewport: { width: 390, height: 844 } })
    try {
      const page = await context.newPage()
      await mockVisualApi(page)
      await page.goto('/settings/appearance')
      await expect(page.getByRole('heading', { name: 'Оформление', exact: true })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      expect(await page.evaluate(() => localStorage.getItem('church.ui.theme'))).toBeNull()
      if (theme === 'light') await page.getByRole('radio', { name: 'Светлая', exact: true }).check()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready
        if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
      })
      site.deploy()
      const proof = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready
        const previous = navigator.serviceWorker.controller!
        const replacement = new Promise<ServiceWorker>((resolve) => registration.addEventListener('updatefound', () => resolve(registration.installing!), { once: true }))
        const controlled = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
        await registration.update()
        const worker = await replacement
        if (worker.state !== 'activated') await new Promise<void>(resolve => worker.addEventListener('statechange', () => { if (worker.state === 'activated') resolve() }))
        await controlled
        return { previousState: previous.state, newState: worker.state, controllerReplaced: navigator.serviceWorker.controller !== previous, newWorkerControls: navigator.serviceWorker.controller === worker }
      })
      expect(proof).toEqual({ previousState: 'redundant', newState: 'activated', controllerReplaced: true, newWorkerControls: true })
      expect(site.servedWorkers).toContain(1)
      expect(site.servedWorkers).toContain(2)
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Оформление', exact: true })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByRole('radio', { name: theme === 'light' ? 'Светлая' : 'Тёмная', exact: true })).toBeChecked()
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', theme === 'light' ? '#f5f6f9' : '#141719')
      expect(await page.evaluate(() => localStorage.getItem('church.ui.theme'))).toBe(theme === 'light' ? 'light' : null)
      await page.screenshot({ path: info.outputPath(`${theme}-updated-pwa.png`) })
      await writeFile(info.outputPath('worker-update.json'), JSON.stringify({ theme, ...proof, servedWorkers: site.servedWorkers, simulation: 'Generated production output; inert sw.js response comment changes deployment revision' }, null, 2))
    } finally {
      await context.close()
      await site.close()
    }
  })
}
