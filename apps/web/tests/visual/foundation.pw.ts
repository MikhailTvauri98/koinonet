import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

type Rgba = [number, number, number, number]

function luminance([red, green, blue]: Rgba) {
  const [r, g, b] = [red, green, blue].map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return r! * 0.2126 + g! * 0.7152 + b! * 0.0722
}

function contrast(first: Rgba, second: Rgba) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (light! + 0.05) / (dark! + 0.05)
}

async function mountFoundation(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
  await mockVisualApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Здравствуйте, Анна!' })).toBeVisible()
  const path = '/_nuxt/@fs/' + process.cwd().replaceAll('\\', '/') + '/tests/visual/support/foundation-harness.ts'
  await page.evaluate(async url => { (await import(/* @vite-ignore */ url)).mount() }, path)
  await expect(page.getByRole('heading', { name: 'Основа интерфейса' })).toBeVisible()
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
}

// Computed colors may come back as color-mix()/color(srgb …); a canvas pixel resolves every CSS form to sRGB bytes.
async function colors(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const tokens = getComputedStyle(document.documentElement)
    function rgba(value: string) {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = 'rgb(1 2 3 / 0.5)'
      context.fillStyle = value
      if (context.fillStyle === 'rgba(1, 2, 3, 0.5)') throw new Error('Unparsed color ' + value)
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data) as [number, number, number, number]
    }
    const token = (name: string) => rgba(tokens.getPropertyValue(name).trim())
    return {
      tokens: Object.fromEntries(['--ui-surface-muted', '--ui-accent', '--ui-danger', '--ui-border-strong', '--ui-focus'].map(name => [name, token(name)])),
      elements: Array.from(document.querySelectorAll(selector)).map((element) => {
        const style = getComputedStyle(element)
        return {
          text: element.textContent?.trim() ?? '', level: element.getAttribute('data-level') ?? '', height: element.getBoundingClientRect().height,
          color: rgba(style.color), background: rgba(style.backgroundColor), borderColor: rgba(style.borderTopColor), borderWidth: style.borderTopWidth,
          outline: { style: style.outlineStyle, width: style.outlineWidth, color: rgba(style.outlineColor) },
        }
      }),
    }
  }, selector)
}

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
    for (const [path, heading] of [['/people', 'Люди'], ['/calendar', 'Календарь'], ['/settings/login', 'Безопасность'], ['/events/new', 'Новое событие']] as const) {
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

for (const theme of ['dark', 'light'] as const) {
  test(`${theme} ministry marks and avatars keep readable text on their tint`, async ({ page }, testInfo) => {
    await mountFoundation(page, theme)
    const marks = (await colors(page, '[data-test=foundation] .ministry-mark--tag')).elements
    expect(marks.map(mark => mark.text)).toEqual(['Фиолетовый цвет', 'Бирюзовый цвет', 'Розовый цвет', 'Янтарный цвет', 'Голубой цвет', 'Зелёный цвет', 'Церковь'])
    expect(new Set(marks.map(mark => mark.color.join())).size, 'each of the seven tokens gives its own text color').toBe(7)
    expect(new Set(marks.map(mark => mark.background.join())).size, 'each of the seven tokens gives its own tint').toBe(7)
    for (const mark of marks) {
      expect(mark.background[3], `${mark.text}: opaque tint`).toBe(255)
      expect(contrast(mark.color, mark.background), `${mark.text} on its tint`).toBeGreaterThanOrEqual(4.5)
    }
    const avatars = (await colors(page, '[data-test=foundation] .ui-avatar')).elements
    expect(avatars.length).toBe(15)
    expect(new Set(avatars.map(avatar => avatar.background.join())).size, 'people get different hues').toBeGreaterThan(3)
    for (const avatar of avatars) {
      expect(avatar.background[3], `${avatar.text}: opaque tint`).toBe(255)
      expect(contrast(avatar.color, avatar.background), `${avatar.text} on its tint`).toBeGreaterThanOrEqual(4.5)
    }
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`foundation-${theme}-${width}.png`), fullPage: true })
    }
  })

  test(`${theme} buttons have three distinct levels, 44px targets and a visible focus`, async ({ page }) => {
    await mountFoundation(page, theme)
    const { tokens, elements } = await colors(page, '[data-test=foundation] [data-level]')
    const level = Object.fromEntries(elements.map(element => [element.level, element]))
    for (const element of elements) expect(element.height, `${element.text} height`).toBeGreaterThanOrEqual(44)
    for (const name of ['base', 'default', 'link']) {
      expect(level[name]!.background, `${name}: tonal fill`).toEqual(tokens['--ui-surface-muted'])
      expect(level[name]!.borderColor[3], `${name}: no visible border`).toBe(0)
    }
    expect(level.primary!.background).toEqual(tokens['--ui-accent'])
    expect(level.quiet!.background[3], 'quiet: no fill').toBe(0)
    expect(level.quiet!.borderColor[3], 'quiet: no visible border').toBe(0)
    expect(level.quiet!.color).toEqual(tokens['--ui-accent'])
    expect(level.danger!.color).toEqual(tokens['--ui-danger'])
    expect(new Set([level.primary, level.default, level.quiet].map(element => element!.background.join())).size, 'three levels differ by fill').toBe(3)
    const field = (await colors(page, '[data-test=foundation] input')).elements[0]!
    expect(field.borderWidth, 'fields keep their border').toBe('1px')
    expect(field.borderColor).toEqual(tokens['--ui-border-strong'])
    for (const name of ['base', 'default', 'primary', 'quiet', 'danger', 'link']) {
      await page.locator(`[data-test=foundation] [data-level=${name}]`).focus()
      const focused = (await colors(page, `[data-test=foundation] [data-level=${name}]`)).elements[0]!
      expect(focused.outline, `${name} focus`).toEqual({ style: 'solid', width: '2px', color: tokens['--ui-focus'] })
    }
  })
}

