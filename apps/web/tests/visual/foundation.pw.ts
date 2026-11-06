import { expect, test } from '@playwright/test'
import { mockVisualApi } from './support/api'

test('base typography and controls are readable without page-specific styles', async ({ page }, testInfo) => {
  await mockVisualApi(page, true)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Вход', exact: true })).toBeVisible()
  const body = await page.locator('body').evaluate(element => ({
    font: getComputedStyle(element).fontFamily,
    margin: getComputedStyle(element).margin,
  }))
  expect(body.font).toMatch(/sans-serif/)
  expect(body.margin).toBe('0px')
  for (const selector of ['input[type=text]', 'input[type=password]', 'button[type=submit]']) {
    const metrics = await page.locator(selector).evaluate(element => ({
      height: element.getBoundingClientRect().height,
      font: parseFloat(getComputedStyle(element).fontSize),
    }))
    expect(metrics.height).toBeGreaterThanOrEqual(44)
    expect(metrics.font).toBeGreaterThanOrEqual(16)
  }
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: testInfo.outputPath('login-' + width + '.png'), fullPage: true })
  }
})

for (const theme of ['dark', 'light']) {
for (const width of [320, 390, 767, 768, 1024, 1440, 1920]) {
  test(`${theme} shell fits ${width}px and keeps its content bounded`, async ({ page }, testInfo) => {
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    await mockVisualApi(page)
    await page.setViewportSize({ width, height: 900 })
    for (const [path, heading] of [['/people', 'Люди'], ['/calendar', 'Календарь'], ['/settings/login', 'Вход'], ['/events/new', 'Создать событие']] as const) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      const content = page.locator('.app-layout__inner')
      await expect(content).toBeVisible()
      const bounds = await content.boundingBox()
      const shellStyle = await content.evaluate(element => {
        const style = getComputedStyle(element)
        return { background: style.backgroundColor, border: style.borderTopWidth, padding: style.paddingLeft, shadow: style.boxShadow }
      })
      expect(shellStyle).toEqual({ background: 'rgba(0, 0, 0, 0)', border: '0px', padding: '0px', shadow: 'none' })
      const title = await page.getByRole('heading', { name: heading, exact: true }).boundingBox()
      expect(title!.x).toBe(bounds!.x)
      expect(bounds!.width).toBeLessThanOrEqual(1152)
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if (width < 768) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        const main = await page.locator('#main-content').boundingBox()
        const nav = await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox()
        const bottomPadding = await page.locator('#main-content').evaluate(e => parseFloat(getComputedStyle(e).paddingBottom))
        expect(main!.y + main!.height - bottomPadding).toBeLessThanOrEqual(nav!.y)
      }
      if ([390, 1440].includes(width)) {
        await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: testInfo.outputPath(path.slice(1).replaceAll('/', '-') + '.png'), fullPage: true })
      }
    }
  })
}
}

test('keyboard can skip navigation and the active link has a visible state', async ({ page }) => {
  await mockVisualApi(page)
  await page.goto('/people')
  await expect(page.getByRole('heading', { name: 'Люди', exact: true })).toBeVisible()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'К содержимому', exact: true })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  const active = page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Люди', exact: true })
  expect(await active.evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  await active.focus()
  expect(await active.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('solid')
})

test('all desktop navigation remains reachable on a short screen', async ({ page }) => {
  await mockVisualApi(page)
  await page.setViewportSize({ width: 1024, height: 400 })
  await page.goto('/people')
  const nav = page.getByRole('navigation', { name: 'Основная навигация' })
  await expect(page.getByRole('heading', { name: 'Люди', exact: true })).toBeVisible()
  expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(400)
  const last = nav.getByRole('link', { name: 'Журнал', exact: true })
  await last.focus()
  await expect(last).toBeInViewport()
})
