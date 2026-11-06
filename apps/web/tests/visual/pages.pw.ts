import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'
import { installAcceptanceApi } from './support/acceptance-api'
import { takeAcceptanceScreenshot } from './support/acceptance-layout'

const name = 'Константинопольский'.repeat(5) + ' Александр Александрович'
const title = 'Событие'.repeat(28)
const ministry = { id: 'm-pages', name: 'Служение'.repeat(12), description: 'Описание '.repeat(35), archived_at: null, chat_id: null, cover_url: null }
const person = { id: 'p-pages', first_name: 'Александр', last_name: name.split(' ')[0]!, patronymic: null, full_name: name, status: 'member', archived: false, photo_url: null, has_account: false, user_id: null, has_global_roles: true, account_disabled: false, ministries: [ministry] }
const event = { id: 'e-pages', title, owner_type: 'church', ministry: null, ministry_id: null, starts_at: '2026-11-08T07:00:00Z', ends_at: '2026-11-09T09:30:00Z', location: 'Помещение'.repeat(22), description: 'Описание '.repeat(40), visibility: 'church', status: 'cancelled', cancel_reason: 'Причина '.repeat(35), can_manage: false, slots: [], attachments: [], chat_id: null }

async function fixtures(page: Page, empty = false) {
  await mockVisualApi(page)
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', '')
    const collection = (data: unknown[]) => ({ data: empty ? [] : data, meta: { current_page: 1, last_page: 1, total: empty ? 0 : data.length } })
    if (path === '/people') await route.fulfill({ json: collection([{ ...person, archived: url.searchParams.has('archived') }]) })
    else if (path === '/people/p-pages') await route.fulfill({ json: { data: { ...person, archived: true } } })
    else if (path === '/ministries') await route.fulfill({ json: collection([ministry]) })
    else if (path === '/ministries/m-pages') await route.fulfill({ json: { data: ministry } })
    else if (path === '/events') await route.fulfill({ json: collection([event]) })
    else if (path === '/events/e-pages') await route.fulfill({ json: { data: event } })
    else await route.fallback()
  })
}
async function fits(page: Page) {
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll('#main-content input, #main-content select, #main-content button')]
      .filter(element => element.getClientRects().length > 0)
      .map(element => { const rect = element.getBoundingClientRect(); return { x: rect.x, right: rect.right } }),
  }))
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
  for (const box of geometry.controls) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(geometry.width + 1)
  }
}
async function wholeHeadingWords(page: Page) {
  const brokenWords = await page.locator('.home-page h1, .home-page .home-section__header h2').evaluateAll(headings => headings.flatMap(heading => {
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
    const broken: string[] = []
    while (walker.nextNode()) {
      const node = walker.currentNode
      for (const word of node.textContent!.matchAll(/[\p{L}]+/gu)) {
        const range = document.createRange()
        range.setStart(node, word.index!)
        range.setEnd(node, word.index! + word[0].length)
        if (new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size > 1) broken.push(word[0])
      }
    }
    return broken
  }))
  expect(brokenWords).toEqual([])
}
for (const [width, scale] of [[320, 200], [375, 100], [768, 100], [1440, 100], [375, 200], [768, 200]] as const) {
  test.describe(`${width}px text ${scale}%`, () => {
    test.beforeEach(async ({ page }) => {
      await fixtures(page)
      await page.clock.setFixedTime(new Date('2026-11-01T08:00:00Z'))
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(percent => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style')
          style.textContent = `html { font-size: ${percent}% !important } nuxt-devtools-frame { display: none !important }`
          document.head.append(style)
        }, { once: true })
      }, scale)
    })
    test('calendar has discoverable action, compact dated period, and readable cancelled cards', async ({ page }, info) => {
      const queries: URL[] = []
      page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/events') queries.push(new URL(request.url())) })
      await page.goto('/calendar?date=2026-11-08&view=list&scope=church')
      await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
      const action = page.getByRole('link', { name: 'Создать событие', exact: true })
      await expect(action).toHaveCSS('background-color', 'rgb(145, 180, 255)')
      const period = page.getByRole('group', { name: 'Период календаря' })
      await expect(period.getByRole('heading', { name: 'ноябрь 2026 г.', exact: true })).toBeVisible()
      await expect(period.getByRole('button', { name: 'Предыдущий месяц', exact: true })).toBeVisible()
      await expect(period.getByRole('button', { name: 'Следующий месяц', exact: true })).toBeVisible()
      await expect(page.locator('[data-test=calendar-date]')).toHaveValue('2026-11-08')
      await expect(page.locator('.calendar-zone')).toContainText('Europe/Moscow')
      expect(queries.at(-1)!.searchParams.get('from')).toBe('2026-11-01')
      expect(queries.at(-1)!.searchParams.get('to')).toBe('2026-11-30')
      // The same multi-day event is readable on both occupied civil dates.
      const rows = page.locator('.event-row')
      await expect(rows).toHaveCount(2)
      await expect(rows.first()).toContainText('Отменено')
      await expect(rows.first().locator('time')).toHaveAttribute('datetime', event.starts_at)
      await fits(page)
      await page.locator('[data-test=selected-day]').getByRole('link', { name: title, exact: true }).click()
      await expect(page).toHaveURL(/\/events\/e-pages\?return=/)
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
      await expect(page.locator('.event-card')).toContainText('8 нояб.')
      await expect(page.locator('.event-card')).toContainText('9 нояб.')
      await expect(page.locator('[data-test=edit-event]')).toHaveCount(0)
      await fits(page)
      await page.screenshot({ path: info.outputPath('event-detail.png'), fullPage: true })
    })
    test('people filters and archive keep long names and hidden contacts', async ({ page }, info) => {
      await page.goto('/people')
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
      await page.locator('[data-test=filter-ministry]').selectOption(ministry.id)
      await page.locator('[data-test=filter-archived]').check()
      await expect(page.locator('.person-item')).toContainText('В архиве')
      await expect(page.locator('.person-item')).toHaveCSS('background-color', 'rgb(29, 34, 37)')
      await fits(page)
      await page.getByRole('link', { name, exact: true }).click()
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
      await expect(page.locator('[data-test=edit-person]')).toBeDisabled()
      await expect(page.getByText('Контакты', { exact: true })).toHaveCount(0)
      await fits(page)
      await page.screenshot({ path: info.outputPath('person-detail.png'), fullPage: true })
    })
    test('ministry list and tabs preserve long content', async ({ page }, info) => {
      await page.goto('/ministries')
      await expect(page.getByRole('link', { name: new RegExp(ministry.name) })).toBeVisible()
      await fits(page)
      await page.locator('.ministries-page__item').click()
      await expect(page.getByRole('heading', { name: ministry.name, exact: true })).toBeVisible()
      await fits(page)
      await page.getByRole('navigation', { name: 'Разделы служения' }).getByRole('link', { name: 'События', exact: true }).click()
      await expect(page.getByRole('heading', { name: /События служения/ })).toBeVisible()
      const period = page.getByRole('group', { name: 'Период календаря' })
      await expect(period.getByRole('heading', { name: 'ноябрь 2026 г.', exact: true })).toBeVisible()
      await expect(period.getByRole('button', { name: 'Предыдущий месяц', exact: true })).toBeVisible()
      await expect(period.getByRole('button', { name: 'Следующий месяц', exact: true })).toBeVisible()
      await fits(page)
      await page.screenshot({ path: info.outputPath('ministry-events.png'), fullPage: true })
    })
    test('empty lists keep filters and primary actions available', async ({ page }) => {
      await fixtures(page, true)
      await page.goto('/people')
      await expect(page.locator('.people-page [role=status]')).toContainText('Люди не найдены.')
      await expect(page.locator('[data-test=create-person]')).toBeVisible()
      await expect(page.locator('[data-test=filter-status]')).toBeVisible()
      await fits(page)
      await page.goto('/ministries')
      await expect(page.locator('.ministries-page [role=status]')).toContainText('Служения ещё не созданы.')
      await expect(page.locator('[data-test=create-ministry]')).toBeVisible()
      await fits(page)
      await page.goto('/calendar')
      await expect(page.getByText('Событий пока нет.', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Создать событие', exact: true })).toBeVisible()
      await fits(page)
    })
    test('home populated events retain cancellation and dates', async ({ page }, info) => {
      await page.goto('/')
      const section = page.getByRole('region', { name: 'Ближайшие мои события' })
      await expect(section.getByRole('link', { name: title, exact: true })).toBeVisible()
      await expect(section).toContainText('Отменено')
      await expect(section.locator('time').first()).toHaveAttribute('datetime', event.starts_at)
      await fits(page)
      await page.screenshot({ path: info.outputPath('home-populated.png'), fullPage: true })
    })
    test('home empty sections keep separate surfaces and links', async ({ page }, info) => {
      await fixtures(page, true)
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Здравствуйте, Анна!' })).toBeVisible()
      const section = page.getByRole('region', { name: 'Ближайшие мои события' })
      await expect(section).toContainText('Ближайших событий пока нет.')
      await expect(section).toHaveCSS('background-color', 'rgb(29, 34, 37)')
      await wholeHeadingWords(page)
      await fits(page)
      await page.screenshot({ path: info.outputPath('home-empty.png'), fullPage: true })
    })
  })
}

// Task18 owns only notification-center scenarios in this shared suite.
test.describe('task18 notification center', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })
  for (const theme of ['dark', 'light'] as const) {
    for (const [width, height, scale] of [[390, 844, 100], [1440, 1000, 100], [320, 900, 200], [375, 390, 100], [320, 390, 200]] as const) {
      test(`task18 ${theme} ${width}x${height}px ${scale}%: notification dates, unread text, pending read and keyboard`, async ({ page }, info) => {
        await mockVisualApi(page)
        await page.setViewportSize({ width, height })
        await page.addInitScript(({ theme, scale }) => {
          localStorage.setItem('church.ui.theme', theme)
          Object.defineProperty(window, 'Notification', { configurable: true, value: Object.assign(function () {}, { permission: 'denied' }) })
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.style.fontSize = `${scale}%`
            const style = document.createElement('style'); style.textContent = 'nuxt-devtools-frame { display: none !important }'; document.head.append(style)
          })
        }, { theme, scale })
        const entries = [
          { id: 'new', category: 'assignments', title: 'Вы назначены на событие «Воскресное собрание»', body: 'Музыкальное служение · Вокал. Начало события в 10:00. ' + 'Пожалуйста, проверьте время и место события. '.repeat(3), url: '/calendar', read_at: null, created_at: '2026-12-31T21:05:00Z' },
          { id: 'read', category: 'announcements', title: 'Подготовка к праздничному событию', body: 'Подробности доступны в объявлении для всей церкви.', url: '/calendar', read_at: '2027-01-01T08:00:00Z', created_at: '2027-01-01T07:00:00Z' },
          { id: 'older', category: 'reminders', title: 'Напоминание о назначении', body: 'Длинныйтекстбезпробелов'.repeat(5), url: '/calendar', read_at: null, created_at: '2026-12-31T20:59:00Z' },
        ]
        await page.route('**/api/v1/notifications', route => route.fulfill({ json: { data: entries, meta: { unread_count: 2 }, next_cursor: null } }))
        let finish!: () => void
        const pending = new Promise<void>(resolve => { finish = resolve })
        await page.route('**/api/v1/notifications/read', async route => { await pending; await route.fulfill({ status: 500, json: { message: 'Private diagnostic' } }) })
        await page.goto('/notifications')
        await expect(page.getByRole('heading', { name: 'Уведомления', exact: true })).toBeVisible()
        await expect(page.locator('.notification-list__group')).toHaveCount(2)
        await expect(page.locator('.notification-list__group h2').first()).toHaveText('1 янв. 2027 г.')
        await expect(page.locator('[data-test=notification-new]')).toContainText('00:05')
        await expect(page.locator('[data-test=notification-new]')).toContainText('Непрочитано')
        await expect(page.locator('[data-test=notification-read]')).not.toContainText('Непрочитано')
        await expect(page.locator('.enable-notifications')).toContainText('запрещены')
        await expect(page.locator('[data-test=enable-push]')).toHaveCount(0)
        const axes = await page.locator('.page-header h1, .enable-notifications, .notification-list__group h2').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().left))
        expect(Math.max(...axes) - Math.min(...axes)).toBeLessThanOrEqual(1)
        await fits(page)
        await page.screenshot({ path: info.outputPath(`notifications-${height}h.png`), fullPage: true })
        const markAll = page.getByRole('button', { name: 'Отметить всё прочитанным' })
        await markAll.focus()
        await markAll.press('Enter')
        await expect(markAll).toBeDisabled()
        await expect(page.locator('[data-test=notification-summary]')).toContainText('Отмечаем')
        await page.screenshot({ path: info.outputPath(`notifications-pending-${height}h.png`), fullPage: true })
        finish()
        await expect(page.locator('.notifications-page [role=alert]')).toContainText('Не удалось отметить')
        await expect(page.locator('[data-test=notification-summary]')).toHaveText('Непрочитано: 2')
        await expect(page.locator('#main-content')).not.toContainText('Private diagnostic')
        const older = page.locator('[data-test=notification-older]')
        // Tab to the last row using native focus scrolling on a short, enlarged screen.
        await page.locator('[data-test=notification-read]').focus()
        await page.keyboard.press('Tab')
        await expect(older).toBeFocused()
        await expect.poll(() => older.evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0)
        const position = await older.boundingBox()
        const navigation = width < 768 ? await page.locator('.app-nav').boundingBox() : null
        // A long row may exceed the viewport; its focused top must remain above navigation.
        const fixedNavigation = await page.locator('.app-nav').evaluate(element => getComputedStyle(element).position === 'fixed')
        const navTop = fixedNavigation ? navigation!.y : height
        expect(position!.y).toBeGreaterThanOrEqual(0)
        expect(position!.y).toBeLessThan(navTop)
        if (position!.height < navTop - 32) expect(position!.y + position!.height).toBeLessThanOrEqual(navTop)
        const title = await older.locator('strong').boundingBox()
        expect(title!.y).toBeGreaterThanOrEqual(0)
        expect(title!.y + title!.height).toBeLessThanOrEqual(navTop)
        await page.screenshot({ path: info.outputPath(`notifications-keyboard-${height}h.png`), fullPage: false })
        await fits(page)
      })
    }
  }

})

async function administrationScreenshot(page: Page, path: string) {
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await page.screenshot({ path, fullPage: true })
}

// Task 19: journal scenarios are separate from unrelated page acceptance.
for (const theme of ['dark', 'light'] as const) {
  for (const [width, scale] of [[390, 1], [1440, 1], [390, 2]] as const) {
    test(`administration audit in ${theme} ${width}px text ${scale * 100}%`, async ({ page }, info) => {
      await mockVisualApi(page)
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height: 900 })
      let failMore = true
      await page.route('**/api/v1/audit?*', route => {
        const cursor = new URL(route.request().url()).searchParams.get('cursor')
        if (cursor && failMore) return route.fulfill({ status: 503, json: {} })
        return route.fulfill({ json: { data: [{ id: cursor ? 'a2' : 'a1', action: 'role.updated', actor: { id: 'u1', name }, subject_type: 'role', subject_id: '01'.repeat(13), created_at: '2026-11-06T07:30:00Z', payload: null, ip: null }], next_cursor: cursor ? null : 'next' } })
      })
      await page.goto('/admin/audit')
      await expect(page.getByRole('heading', { name: 'Фильтры журнала', exact: true })).toBeVisible()
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important }' })
      await expect(page.locator('main')).toContainText('Europe/Moscow')
      await page.getByLabel('Начало периода', { exact: true }).fill('2026-11-06')
      await expect(page.locator('main time').first()).toHaveAttribute('datetime', '2026-11-06T07:30:00Z')
      await page.locator('[data-test=load-more]').click()
      await expect(page.locator('[role=alert]')).toContainText('Не удалось загрузить журнал')
      await expect(page.locator('.admin-audit__list li')).toHaveCount(1)
      await fits(page)
      await administrationScreenshot(page, info.outputPath('admin-audit-error.png'))
      failMore = false
      await page.locator('[data-test=retry]').click()
      await expect(page.locator('.admin-audit__list li')).toHaveCount(2)
      await page.locator('[data-test=entry-actor-a1]').click()
      await expect(page.getByRole('button', { name: 'Сбросить фильтр по автору' })).toBeVisible()
      await fits(page)
      await administrationScreenshot(page, info.outputPath('admin-audit.png'))
    })
  }
}


// Task 16: directory and person details; account and person identifiers deliberately differ.
for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, scale] of [[390, 900, 1], [1440, 900, 1], [320, 900, 2], [390, 390, 2]] as const) {
    test(`task16 people directory and card in ${theme} ${width}x${height} text ${scale * 100}%`, async ({ page }, info) => {
      await mockVisualApi(page)
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height })
      const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="320"><rect width="180" height="320" fill="#607b9b"/><circle cx="90" cy="100" r="52" fill="#eac3a0"/><path d="M0 320v-50a90 90 0 0 1 180 0v50" fill="#25334b"/></svg>')
      const card = { ...person, full_name: 'Константинопольский Александр Александрович', last_name: 'Константинопольский', photo_url: photo,
        archived: false, has_account: true, user_id: 'account-other', account_disabled: true,
        contacts: { phone: '+7 999 123-45-67', email: 'alexander.long-address@example.test', birth_date: '1990-03-15' },
        note: 'Заметка с разрешёнными сведениями. '.repeat(3),
        ministries: [{ id: 'm1', name: 'Музыкальное служение' }, { id: 'm2', name: 'Служение помощи людям и семьям' }],
        global_roles: [{ id: 'r1', name: 'Участник' }, { id: 'r2', name: 'Ответственный за объявления церкви' }],
      }
      await page.route('**/api/v1/people**', route => {
        const path = new URL(route.request().url()).pathname
        return route.fulfill({ json: path.endsWith('/people') ? { data: [card, { ...card, id: 'other', full_name: 'Иванова Мария', photo_url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><rect width="320" height="100" fill="#4d6685"/><circle cx="160" cy="50" r="45" fill="#ecc4a4"/></svg>'), has_global_roles: false, account_disabled: false }], meta: { current_page: 1, last_page: 1, total: 2 } } : { data: card } })
      })
      await page.goto('/people')
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
      await expect(page.locator('.person-item')).toHaveCount(2)
      if (width === 1440) expect((await page.locator('.person-item').last().boundingBox())!.height).toBeLessThanOrEqual(100)
      await fits(page)
      await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important }' })
      await page.screenshot({ path: info.outputPath('people-directory.png'), fullPage: true })
      await page.getByRole('link', { name: card.full_name, exact: true }).click()
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
      await expect(page.getByRole('heading', { name: card.full_name, exact: true })).toBeVisible()
      await expect(page.locator('[data-test=contacts]')).toContainText(card.contacts.email)
      await expect(page.locator('.person-roles')).toContainText('Ответственный')
      await expect(page.locator('.person-account')).toContainText('Аккаунт отключён')
      await expect(page.locator('[data-test=write]')).toHaveCount(0)
      await expect(page.locator('.person-card__management')).not.toHaveAttribute('open')
      await fits(page)
      await page.screenshot({ path: info.outputPath('people-card.png'), fullPage: true })
      const edit = page.locator('[data-test=edit-person]')
      await edit.click()
      await expect(page.locator('[name=last_name]')).toBeFocused()
      await page.locator('[data-test=cancel-person]').click()
      await expect(edit).toBeFocused()
      // The server projection is the only source of hidden personal data.
      await page.route('**/api/v1/people/p-pages', route => route.fulfill({ json: { data: { ...card, photo_url: null, contacts: undefined, note: undefined } } }))
      await page.reload()
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
      await expect(page.getByRole('heading', { name: card.full_name, exact: true })).toBeVisible()
      await expect(page.locator('[data-test=contacts]')).toHaveCount(0)
      await expect(page.locator('[data-test=note]')).toHaveCount(0)
      await expect(page.locator('[data-test=person-photo]')).toHaveCount(0)
      await fits(page)
      await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important }' })
      await page.screenshot({ path: info.outputPath('people-card-masked.png'), fullPage: true })
    })
  }
}


for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, scale] of [[390, 900, 1], [1440, 900, 1], [390, 390, 2]] as const) {
    test(`task16 invitation dialog in ${theme} ${width}x${height} text ${scale * 100}%`, async ({ page }, info) => {
      await mockVisualApi(page)
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height })
      await page.route('**/api/v1/people/p-pages', route => route.fulfill({ json: { data: { ...person, full_name: 'Иванова Анна Петровна', global_roles: [{ id: 'r1', name: 'Участник' }], ministries: [] } } }))
      let release!: () => void
      const pending = new Promise<void>(resolve => { release = resolve })
      await page.route('**/api/v1/people/p-pages/invite', async route => {
        await pending
        await route.fulfill({ json: { data: { url: 'https://church.test/invite/one-time-secret', expires_at: '2026-11-13T12:00:00Z' } } })
      })
      await page.goto('/people/p-pages')
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
      const invite = page.locator('[data-test=invite]')
      await invite.click()
      await expect(page.locator('[data-test=edit-person]')).toBeDisabled()
      await expect(page.locator('[data-test=edit-roles]')).toBeDisabled()
      release()
      const dialog = page.getByRole('dialog', { name: 'Приглашение', exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveClass('ui-dialog')
      await expect(dialog.locator('[data-test=link-qr]')).toBeVisible()
      await expect(dialog.locator('[data-test=invite-link]')).toContainText('one-time-secret')
      await expect(page.locator('[data-test=edit-person]')).toBeDisabled()
      await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important }' })
      await page.screenshot({ path: info.outputPath('people-invitation-viewport.png') })
      await dialog.locator('[data-test=copy-invite-link]').scrollIntoViewIfNeeded()
      await expect(dialog.locator('[data-test=copy-invite-link]')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(page.locator('[data-test=invite-link]')).toHaveCount(0)
      await expect(invite).toBeFocused()
      await expect(page.locator('[data-test=edit-person]')).toBeEnabled()
    })
  }
}

// Task17 owns home and announcements. Keep other task scenarios untouched.
test.describe('task17 home and announcements', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const [width, height, scale] of [[390, 844, 100], [1440, 1000, 100], [320, 900, 200], [375, 390, 200]] as const) {
      test(`task17 ${theme} ${width}x${height} ${scale}%: priorities, empty home and editor focus`, async ({ page }, info) => {
        const api = await installAcceptanceApi(page)
        await page.setViewportSize({ width, height })
        await page.addInitScript(({ theme, scale }) => {
          localStorage.setItem('church.ui.theme', theme)
          document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${scale}%` })
        }, { theme, scale })
        await page.goto('/')
        await expect(page.locator('.home-section__header h2')).toHaveText(['Ближайшие мои события', 'Закреплённые объявления', 'Непрочитанное'])
        await expect(page.getByRole('region', { name: 'Закреплённые объявления' }).getByRole('link', { name: api.data.announcement.title, exact: true })).toBeVisible()
        await expect(page.locator('.home-section__header h2').first()).toHaveCSS('font-size', scale === 200 ? '36px' : '18px')
        await fits(page)
        await takeAcceptanceScreenshot(page, info, `task17-${theme}-${width}x${height}-${scale}-home`)
        api.respond('GET', '/announcements', () => ({ json: { data: [], meta: { current_page: 1, last_page: 1, total: 0 } } }))
        api.respond('GET', '/events', () => ({ json: { data: [], meta: { current_page: 1, last_page: 1, total: 0 } } }))
        api.respond('GET', '/chats', () => ({ json: { data: [], meta: { unread_total: 0 } } }))
        await page.reload()
        await expect(page.getByText('Ближайших событий пока нет.', { exact: true })).toBeVisible()
        await expect(page.getByText('Закреплённых объявлений пока нет.', { exact: true })).toBeVisible()
        await expect(page.getByText('Непрочитанных сообщений нет.', { exact: true })).toBeVisible()
        await fits(page)
        await takeAcceptanceScreenshot(page, info, `task17-${theme}-${width}x${height}-${scale}-home-empty`)
        await page.goto('/announcements/a1')
        const edit = page.getByRole('button', { name: 'Изменить', exact: true })
        await edit.click()
        await expect(page.locator('[data-test=editor-heading]')).toBeFocused()
        await expect(page.locator('.markdown-body')).toHaveCount(0)
        api.respond('PATCH', '/announcements/a1', () => ({ status: 422, json: { message: 'Проверьте поля.', errors: { title: ['Уточните заголовок объявления.'] } } }))
        await page.getByRole('textbox', { name: 'Заголовок', exact: true }).fill('Черновик после ошибки')
        await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
        const field = page.getByRole('textbox', { name: 'Заголовок', exact: true })
        await expect(field).toBeFocused()
        await expect(field).toHaveAttribute('aria-invalid', 'true')
        await expect(field).toHaveAccessibleDescription('Уточните заголовок объявления.')
        const bounds = await field.boundingBox()
        const fixedNav = await page.locator('.app-nav').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).position === 'fixed').map(node => node.getBoundingClientRect().top))
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(Math.min(height, ...fixedNav))
        await fits(page)
        if (width === 1440 && scale === 100) {
          const publication = (await page.locator('.announcement-editor__publication').boundingBox())!
          const text = (await page.locator('.announcement-editor__text').boundingBox())!
          const attachments = (await page.locator('.announcement-editor__attachments').boundingBox())!
          expect.soft(attachments.x).toBe(publication.x)
          expect.soft(attachments.x + attachments.width).toBe(text.x + text.width)
          expect.soft(attachments.y).toBeGreaterThanOrEqual(Math.max(publication.y + publication.height, text.y + text.height) + 16)
          const rows = page.locator('.selected-attachments > li')
          const first = (await rows.nth(0).boundingBox())!, second = (await rows.nth(1).boundingBox())!
          expect.soft(second.y - first.y - first.height).toBe(8)
        }
        await takeAcceptanceScreenshot(page, info, `task17-${theme}-${width}x${height}-${scale}-editor-error`)
        await page.getByRole('button', { name: 'Отмена', exact: true }).click()
        await expect(page.getByRole('heading', { name: api.data.announcement.title, exact: true })).toBeFocused()
        await expect(page.locator('.markdown-body')).toBeVisible()
        expect(api.unhandled).toEqual([])
      })
    }
  }
})

test('task17 home keeps available sections while one request is pending or failed', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  api.respond('GET', '/announcements', async () => { await pending; return { status: 500, json: { message: 'Private diagnostic' } } })
  await page.goto('/')
  try {
    await expect(page.getByRole('heading', { name: 'Здравствуйте, Анна!' })).toBeVisible()
    const pins = page.getByRole('region', { name: 'Закреплённые объявления' })
    await expect(pins.getByRole('status')).toContainText('Загружаем объявления…')
    await expect(page.getByRole('region', { name: 'Ближайшие мои события' }).getByRole('link', { name: api.data.event.title, exact: true })).toBeVisible()
    await takeAcceptanceScreenshot(page, info, 'task17-home-pending')
  } finally { release() }
  await expect(page.getByRole('region', { name: 'Закреплённые объявления' }).getByRole('alert')).toContainText('Не удалось загрузить закреплённые объявления.')
  await expect(page.getByRole('region', { name: 'Непрочитанное' }).getByRole('link', { name: /Все чаты/ })).toBeVisible()
  await fits(page)
  await takeAcceptanceScreenshot(page, info, 'task17-home-error')
  expect(api.unhandled).toEqual([])
})

test('task17 maximum five home events keep pinned announcements and unread chats together', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  api.respond('GET', '/events', () => ({ json: { data: Array.from({ length: 5 }, (_, index) => ({ ...api.data.event, id: `home-event-${index}`, title: `Личное событие ${index + 1}` })), meta: { current_page: 1, last_page: 1, total: 5 } } }))
  await page.goto('/')
  const events = page.getByRole('region', { name: 'Ближайшие мои события' })
  await expect(events.locator('.event-card')).toHaveCount(5)
  const pins = page.getByRole('region', { name: 'Закреплённые объявления' })
  const unread = page.getByRole('region', { name: 'Непрочитанное' })
  await expect(pins.getByRole('link', { name: api.data.announcement.title, exact: true })).toBeVisible()
  await expect(unread.locator('.chat-list')).toBeVisible()
  const top = (await unread.boundingBox())!.y, bottom = (await pins.boundingBox())!
  expect(top - bottom.y - bottom.height).toBe(16)
  await fits(page)
  await takeAcceptanceScreenshot(page, info, 'task17-five-events-columns')
  expect(api.unhandled).toEqual([])
})
