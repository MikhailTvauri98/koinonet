import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { installAcceptanceApi } from './support/acceptance-api'
import { checkDocumentWidth, settleLayout, takeAcceptanceScreenshot } from './support/acceptance-layout'

// Regression: the shared h1 minimum must not strand the last letter of a
// normal fixed UI word at narrow widths. These are interface headings only;
// legal 200-character unbroken announcement/user titles must still wrap.
const fixedHeadings = [
  ['/settings/devices', 'Устройства'],
  ['/admin/roles', 'Глобальные роли'],
  ['/notifications', 'Уведомления'],
  ['/admin/settings', 'Настройки церкви'],
  ['/admin/audit', 'Журнал действий'],
  ['/settings/ical', 'Календарь телефона'],
] as const

for (const width of [320, 375]) {
  test('fixed UI heading words at ' + width + 'px text 200%', async ({ page }, info) => {
    const api = await installAcceptanceApi(page)
    await page.setViewportSize({ width, height: 900 })
    const measurements: unknown[] = []
    for (const [path, text] of fixedHeadings) {
      await page.goto(path)
      const heading = page.getByRole('heading', { level: 1, name: text, exact: true })
      await expect(heading).toBeVisible()
      await settleLayout(page)
      const originalFont = await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await settleLayout(page)
      const measured = await heading.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const words: { text: string, lineTops: number[] }[] = []
        let node: Node | null
        while ((node = walker.nextNode())) {
          for (const word of (node.textContent ?? '').matchAll(/\p{L}[\p{L}\p{M}]*/gu)) {
            const range = document.createRange()
            range.setStart(node, word.index!)
            range.setEnd(node, word.index! + word[0].length)
            words.push({ text: word[0], lineTops: Array.from(new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top)))) })
          }
        }
        return {
          text: element.textContent,
          fontSize: parseFloat(getComputedStyle(element).fontSize),
          rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
          availableWidth: element.getBoundingClientRect().width,
          words,
        }
      })
      measurements.push({ path, width, originalFont, ...measured })
      expect.soft(measured.words.length, 'the actual heading has measured words').toBeGreaterThan(0)
      expect.soft(measured.words.filter(word => word.lineTops.length !== 1), path + ': complete UI words may wrap between words').toEqual([])
      expect.soft(measured.rootFontSize, 'text enlargement remains enabled').toBe(32)
      expect.soft(measured.fontSize, 'mobile heading scales with enlarged text').toBeGreaterThanOrEqual(originalFont * 1.95)
      await checkDocumentWidth(page)
      await takeAcceptanceScreenshot(page, info, path.slice(1).replaceAll('/', '-') + '-text-200')
    }
    const geometryFile = info.outputPath('heading-word-geometry.json')
    await writeFile(geometryFile, JSON.stringify(measurements, null, 2))
    await info.attach('heading-word-geometry', { path: geometryFile, contentType: 'application/json' })
    expect(api.unhandled).toEqual([])
  })
}

test('fixed action words remain readable at 320px text 200%', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  await page.setViewportSize({ width: 320, height: 900 })
  const measurements: unknown[] = []
  for (const path of ['/notifications', '/announcements']) {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    if (path === '/announcements') await page.getByRole('button', { name: 'Опубликовать объявление', exact: true }).click()
    await settleLayout(page)
    const labels = path === '/notifications'
      ? ['Включить уведомления', 'Отметить всё прочитанным']
      : ['Опубликовать объявление', 'Опубликовать']
    for (const label of labels) {
      const button = page.getByRole('button', { name: label, exact: true })
      // Some browser engines do not expose Push API. Their explanatory UI is
      // covered separately; do not pretend a nonexistent opt-in button rendered.
      if (label === 'Включить уведомления' && !await button.count()) {
        const supported = await page.evaluate(() => 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator)
        expect(supported, 'supported desktop browser exposes the explicit opt-in action').toBe(false)
        continue
      }
      await expect(button).toBeVisible()
      const measured = await button.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const broken: string[] = []
        let node: Node | null
        while ((node = walker.nextNode())) {
          for (const word of (node.textContent ?? '').matchAll(/\p{L}[\p{L}\p{M}]*/gu)) {
            const range = document.createRange()
            range.setStart(node, word.index!)
            range.setEnd(node, word.index! + word[0].length)
            if (new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size > 1) broken.push(word[0])
          }
        }
        const bounds = element.getBoundingClientRect()
        return { label: element.textContent, fontSize: parseFloat(getComputedStyle(element).fontSize), left: bounds.left, right: bounds.right, broken }
      })
      measurements.push({ path, ...measured })
      expect.soft(measured.broken, path + ': normal fixed action words should stay whole').toEqual([])
      expect.soft(measured.fontSize, 'the button keeps enlarged text').toBeGreaterThanOrEqual(32)
      expect.soft(measured.left).toBeGreaterThanOrEqual(0)
      expect.soft(measured.right).toBeLessThanOrEqual(320)
    }
    await checkDocumentWidth(page)
    await takeAcceptanceScreenshot(page, info, path.slice(1) + '-actions-text-200')
  }
  const geometryFile = info.outputPath('action-word-geometry.json')
  await writeFile(geometryFile, JSON.stringify(measurements, null, 2))
  await info.attach('action-word-geometry', { path: geometryFile, contentType: 'application/json' })
  expect(api.unhandled).toEqual([])
})
