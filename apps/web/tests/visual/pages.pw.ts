import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

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
  const brokenWords = await page.locator('.home-page h1, .home-page section > h2').evaluateAll(headings => headings.flatMap(heading => {
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
      await page.goto('/calendar')
      await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
      const action = page.getByRole('link', { name: 'Создать событие', exact: true })
      await expect(action).toHaveCSS('background-color', 'rgb(35, 78, 121)')
      const period = page.getByRole('group', { name: 'Период календаря' })
      await expect(period.locator('time')).toHaveCount(2)
      await expect(period).toContainText('Europe/Moscow')
      await expect(period.locator('time').first()).toHaveAttribute('datetime', '2026-10-26')
      await expect(period.locator('time').last()).toHaveAttribute('datetime', '2026-11-22')
      await expect(period.locator('time').first()).toHaveText('26.10.2026')
      await expect(period.locator('time').last()).toHaveText('22.11.2026')
      await expect(page.locator('.event-card')).toContainText('Отменено')
      await expect(page.locator('.event-card time').first()).toHaveAttribute('datetime', event.starts_at)
      await fits(page)
      await page.getByRole('link', { name: title, exact: true }).click()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
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
      await expect(page.locator('.person-item')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
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
      await expect(page.getByRole('group', { name: 'Период календаря' }).locator('time')).toHaveCount(2)
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
      await expect(section).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await wholeHeadingWords(page)
      await fits(page)
      await page.screenshot({ path: info.outputPath('home-empty.png'), fullPage: true })
    })
  })
}
