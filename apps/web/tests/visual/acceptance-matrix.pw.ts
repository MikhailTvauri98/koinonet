import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { installAcceptanceApi } from './support/acceptance-api'
import { checkDocumentWidth, focusReachableAction, settleLayout, takeAcceptanceScreenshot } from './support/acceptance-layout'
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
  ['/events/new', 'Новое событие', false],
  ['/events/e1', 'Воскресное событие и совместный обед', false],
  ['/templates', 'Шаблоны', false],
  ['/templates/t1', 'Воскресное событие', false],
  ['/announcements', 'Объявления', false],
  ['/announcements/a1', 'Объявление'.repeat(20), false],
  ['/chats', 'Чаты', false],
  ['/chats/c1', 'Подготовка воскресного события', false],
  ['/notifications', 'Уведомления', false],
  ['/settings/profile', 'Профиль', false],
  ['/settings/login', 'Безопасность', false],
  ['/settings/appearance', 'Оформление', false],
  ['/settings/devices', 'Устройства', false],
  ['/settings/notifications', 'Уведомления', false],
  ['/settings/ical', 'Календарь телефона', false],
  ['/admin/roles', 'Глобальные роли', false],
  ['/admin/settings', 'Настройки церкви', false],
  ['/admin/audit', 'Журнал действий', false],
] as const

for (const theme of ['dark', 'light'] as const) for (const [path, heading, guest] of routes) {
  test(`acceptance matrix ${theme}: ${path}`, async ({ page }, info) => {
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page, { guest, long: true })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: typeof heading === 'string' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

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
            const style = await shell.evaluate(element => {
              const style = getComputedStyle(element)
              return { background: style.backgroundColor, border: style.borderTopWidth, padding: style.paddingLeft, shadow: style.boxShadow }
            })
            expect.soft(style, 'the shared shell adds no blanket outer card').toEqual({ background: 'rgba(0, 0, 0, 0)', border: '0px', padding: '0px', shadow: 'none' })
            const root = await shell.locator(':scope > :first-child').boundingBox()
            expect.soft(root!.x, 'page root shares the shell left edge').toBeCloseTo(bounds.x, 0)
          }
        }
        if ([375, 390, 1440].includes(width)) await takeAcceptanceScreenshot(page, info, width + 'px')
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
    await page.setViewportSize({ width: 320, height: 390 })
    await settleLayout(page)
    expect(await page.locator('html').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(32)
    geometry.push({ width: 320, height: 390, text: 200, scrollWidth: await checkDocumentWidth(page) })
    // Test each route's working control, not a convenient breadcrumb or tab.
    const controls = {
      '/login': page.locator('button[type=submit]'),
      '/invite/acceptance-invite': page.locator('button[type=submit]'),
      '/password-reset/acceptance-reset': page.locator('button[type=submit]'),
      '/': page.locator('.upcoming-events a[href^="/events/"]').first(),
      '/people': page.getByRole('button', { name: 'Создать человека', exact: true }),
      '/people/p1': page.locator('[data-test=edit-person]'),
      '/ministries': page.getByRole('button', { name: 'Создать служение', exact: true }),
      '/ministries/m1': page.locator('[data-test=edit-ministry]'),
      '/ministries/m1/members': page.getByRole('button', { name: 'Добавить участника', exact: true }),
      '/ministries/m1/roles': page.locator('[data-test=create-role]'),
      '/ministries/m1/events': page.locator('[data-test=create-event]'),
      '/ministries/m1/announcements': page.getByRole('button', { name: 'Опубликовать объявление', exact: true }),
      '/ministries/m1/chat': page.getByRole('textbox', { name: 'Сообщение', exact: true }),
      '/calendar': page.locator('[data-test=calendar-date]'),
      '/events/new': page.locator('[data-test=save-event-top]'),
      '/events/e1': page.locator('[data-test=assign-s1]'),
      '/templates': page.locator('[data-test=new-template]'),
      '/templates/t1': page.locator('[data-test=event-date]'),
      '/announcements': page.getByRole('button', { name: 'Опубликовать объявление', exact: true }),
      '/announcements/a1': page.locator('.announcement-page__actions button').first(),
      '/chats': page.locator('[data-test=new-message]'),
      '/chats/c1': page.getByRole('textbox', { name: 'Сообщение', exact: true }),
      '/notifications': page.locator('[data-test=mark-all-read]'),
      '/settings/profile': page.locator('[data-test=save-profile]'),
      '/settings/login': page.locator('[data-test=save-login]'),
      '/settings/appearance': page.getByRole('radio', { name: 'Светлая', exact: true }),
      '/settings/devices': page.locator('[data-test=end-session2]'),
      '/settings/notifications': page.locator('[data-test=category-reminders]'),
      '/settings/ical': page.locator('[data-test=copy]'),
      '/admin/roles': page.locator('[data-test=create-role]'),
      '/admin/settings': page.locator('[data-test=save-settings]'),
      '/admin/audit': page.locator('[data-test=filter-action]'),
    }
    const focusedControl = await focusReachableAction(page, controls[path])
    await writeFile(info.outputPath('focused-control.json'), JSON.stringify({ theme, path, focusedControl }, null, 2))
    await takeAcceptanceScreenshot(page, info, '320x390-text-200-focused-action', false)
    await textStyle.evaluate(element => element.parentNode?.removeChild(element))
    await page.setViewportSize({ width: 375, height: 390 })
    await settleLayout(page)
    geometry.push({ width: 375, height: 390, text: 100, scrollWidth: await checkDocumentWidth(page) })

    const geometryFile = info.outputPath('geometry.json')
    await writeFile(geometryFile, JSON.stringify({ theme, path, geometry }, null, 2))
    await info.attach('geometry', { path: geometryFile, contentType: 'application/json' })
    expect.soft(errors, 'no client-side exceptions').toEqual([])
    expect.soft(api.unhandled, 'all API and controlled media requests have explicit fixtures').toEqual([])
  })
}

for (const theme of ['dark', 'light'] as const) {
  test(`${theme} acceptance refuses management and distinguishes empty from failed reads`, async ({ page }, info) => {
    await page.addInitScript(theme => {
      localStorage.setItem('church.ui.theme', theme)
      document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%' })
    }, theme)
    const api = await installAcceptanceApi(page, { empty: true })
    api.data.me.permissions = { administrator: false, global: [], ministries: {} }
    api.data.event.can_manage = false
    api.data.event.slots[0]!.can_fill = false
    await page.setViewportSize({ width: 320, height: 390 })
    await page.goto('/events/e1')
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await expect(page.getByRole('heading', { name: api.data.event.title, exact: true })).toBeVisible()
    await expect(page.locator('[data-test=edit-event], [data-test=assign-s1], [data-test=edit-slot-s1]')).toHaveCount(0)
    await focusReachableAction(page)
    await page.screenshot({ path: info.outputPath('denied-management.png') })
    await page.goto('/calendar')
    await expect(page.locator('.empty-state')).toContainText('Событий пока нет.')
    await expect(page.locator('.event-row')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Создать событие', exact: true })).toHaveCount(0)
    await checkDocumentWidth(page)
    await takeAcceptanceScreenshot(page, info, 'empty-without-management')
    api.data.me.permissions.administrator = true
    let failed = true
    api.respond('GET', '/people', () => failed ? { status: 503, json: { message: 'Private diagnostic' } } : { json: { data: [], meta: { current_page: 1, last_page: 1, total: 0 } } })
    await page.goto('/people')
    await expect(page.locator('#main-content [role=alert]')).toContainText('Не удалось загрузить людей')
    await expect(page.locator('#main-content')).not.toContainText('Private diagnostic')
    await expect(page.locator('#main-content .empty-state')).toHaveCount(0)
    failed = false
    await page.getByRole('button', { name: 'Повторить', exact: true }).click()
    await expect(page.locator('#main-content .empty-state')).toBeVisible()
    await expect(page.locator('#main-content [role=alert]')).toHaveCount(0)
    expect(api.unhandled).toEqual([])
  })
}
