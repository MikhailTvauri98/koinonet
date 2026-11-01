import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { installAcceptanceApi } from './support/acceptance-api'
import { checkDocumentWidth, settleLayout, takeAcceptanceScreenshot } from './support/acceptance-layout'
import { measureWordWrapping } from './support/word-wrapping'

// A removed width constraint, unbreakable title or intrinsic select/fieldset
// minimum must fail real browser layout; API operations belong to the real E2E.
const routes = [
  ['/login', 'Вход', true],
  ['/invite/acceptance-invite', 'Приглашение', true],
  ['/password-reset/acceptance-reset', 'Сброс пароля', true],
  ['/', 'Здравствуйте, Анна!', false],
  ['/people', 'Люди', false],
  ['/people/p1', 'Петрова-Константинопольская Анна Сергеевна', false],
  ['/ministries', 'Служения', false],
  ['/ministries/m1', 'Служение'.repeat(12) + 'Хоры', false],
  ['/ministries/m1/members', 'Участники', false],
  ['/ministries/m1/roles', 'Роли служения', false],
  ['/ministries/m1/events', /^События служения/, false],
  ['/ministries/m1/announcements', 'Объявления служения', false],
  ['/ministries/m1/chat', 'Подготовка воскресного события', false],
  ['/calendar', 'Календарь', false],
  ['/events/new', 'Создать событие', false],
  ['/events/e1', 'Воскресное событие и совместный обед', false],
  ['/templates', 'Шаблоны', false],
  ['/templates/t1', 'Воскресное событие', false],
  ['/announcements', 'Объявления', false],
  ['/announcements/a1', 'Объявление'.repeat(20), false],
  ['/chats', 'Чаты', false],
  ['/chats/c1', 'Подготовка воскресного события', false],
  ['/notifications', 'Уведомления', false],
  ['/settings/profile', 'Профиль', false],
  ['/settings/login', 'Вход', false],
  ['/settings/devices', 'Устройства', false],
  ['/settings/notifications', 'Уведомления', false],
  ['/settings/ical', 'Календарь телефона', false],
  ['/admin/roles', 'Глобальные роли', false],
  ['/admin/settings', 'Настройки церкви', false],
  ['/admin/audit', 'Журнал действий', false],
] as const

for (const [path, heading, guest] of routes) {
  test('acceptance matrix: ' + path, async ({ page }, info) => {
    const api = await installAcceptanceApi(page, { guest, long: true })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: typeof heading === 'string' })).toBeVisible()

    const geometry: { width: number, height: number, text: number, scrollWidth: number }[] = []
    for (const width of [320, 375, 390, 767, 768, 1024, 1440, 1920]) {
      await test.step(width + 'px', async () => {
        await page.setViewportSize({ width, height: 900 })
        await settleLayout(page)
        const scrollWidth = await checkDocumentWidth(page)
        geometry.push({ width, height: 900, text: 100, scrollWidth })
        const shell = page.locator('.app-layout__inner')
        if (!guest) {
          const bounds = await shell.boundingBox()
          expect.soft(bounds, 'authenticated content exists').not.toBeNull()
          if (bounds) {
            expect.soft(bounds.x).toBeGreaterThanOrEqual(0)
            expect.soft(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
            expect.soft(bounds.width).toBeLessThanOrEqual(1152)
          }
        }
        if (width === 375 || width === 1440) await takeAcceptanceScreenshot(page, info, width + 'px')
      })
    }

    // Rem-based text enlargement is a desktop browser check, not evidence of
    // iOS Dynamic Type, a physical keyboard or an installed phone PWA.
    const textStyle = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await settleLayout(page)
      expect.soft(await page.locator('html').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(32)
      geometry.push({ width, height: 900, text: 200, scrollWidth: await checkDocumentWidth(page) })
      if (path === '/templates/t1' && width === 320) {
        const date = page.locator('[data-test=event-date]')
        await date.fill('2026-11-08')
        await expect(date).toHaveValue('2026-11-08')
        const locator = page.locator('.template-page button, .template-page input')
        const wrapping = await locator.evaluateAll(measureWordWrapping, null)
        const geometry = await locator.evaluateAll(elements => elements.map((element) => {
          const bounds = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { tag: element.tagName, text: element.textContent?.trim(), left: bounds.left, right: bounds.right, width: bounds.width, parentRight: parent.right,
            marginLeft: style.marginLeft, marginRight: style.marginRight, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight }
        }))
        const controls = geometry.map((item, index) => ({ ...item, broken: wrapping[index]!.broken }))
        const controlFile = info.outputPath('template-controls.json')
        await writeFile(controlFile, JSON.stringify(controls, null, 2))
        await info.attach('template-controls', { path: controlFile, contentType: 'application/json' })
        for (const control of controls) {
          expect.soft(control.right, control.text ?? 'date input remains inside its label').toBeLessThanOrEqual(control.parentRight + 1)
          expect.soft(control.broken, 'fixed template action words stay whole').toEqual([])
        }
        expect.soft((await date.boundingBox())!.width, 'enlarged native date retains the full year and calendar area').toBeGreaterThanOrEqual(250)
      }
      if (width === 320) await takeAcceptanceScreenshot(page, info, '320px-text-200')
    }
    await textStyle.evaluate(element => element.parentNode?.removeChild(element))
    await page.setViewportSize({ width: 375, height: 390 })
    await settleLayout(page)
    geometry.push({ width: 375, height: 390, text: 100, scrollWidth: await checkDocumentWidth(page) })

    const geometryFile = info.outputPath('geometry.json')
    await writeFile(geometryFile, JSON.stringify({ path, geometry }, null, 2))
    await info.attach('geometry', { path: geometryFile, contentType: 'application/json' })
    expect.soft(errors, 'no client-side exceptions').toEqual([])
    expect.soft(api.unhandled, 'all API and controlled media requests have explicit fixtures').toEqual([])
  })
}
