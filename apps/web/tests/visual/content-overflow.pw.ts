import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

const title = 'Объявление'.repeat(20) // 200 символов без пробелов.
const ministryName = 'Служение'.repeat(12) + 'АБВГ' // 100 символов.
const roleName = 'Роль'.repeat(25)
const warning = 'Проверьте данные. ' + ministryName
const ministry = { id: 'm-overflow', name: ministryName }
const announcement = {
  id: 'a-overflow', scope: 'ministry', ministry, author: { id: 'u-visual', full_name: 'Анна Петрова' },
  title, body: '**Важная дата:** 08.11.2026. ' + title, pinned: true, hide_after: '2026-12-31',
  notify_on_publish: false, published_at: '2026-11-01T08:00:00Z', archived: false, attachments: [], views_count: 18,
}

async function fixtures(page: Page) {
  await mockVisualApi(page)
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (route.request().method() === 'POST' && ['/events', '/templates'].includes(path)) {
      await route.fulfill({ status: 422, json: { message: warning, errors: { title: [warning] } } })
    } else if (path === '/ministries') await route.fulfill({ json: { data: [ministry] } })
    else if (path === '/calendar/slot-choices') await route.fulfill({ json: { data: [{ ...ministry, roles: [{ id: 'r-overflow', name: roleName }] }] } })
    else if (path === '/announcements') await route.fulfill({ json: { data: [announcement], meta: { current_page: 1, last_page: 1, total: 1 } } })
    else if (path === '/announcements/a-overflow') await route.fulfill({ json: { data: announcement } })
    else await route.fallback()
  })
}

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth))
  for (const control of await page.locator('form input:visible:not([type=checkbox]), form select:visible, form textarea:visible, form fieldset:visible').all()) {
    const bounds = await control.boundingBox()
    const viewport = page.viewportSize()!
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
  }
}

for (const width of [320, 375, 768, 1440]) {
  for (const scale of [100, 200]) {
    test.describe(`${width}px, text ${scale}%`, () => {
      test.beforeEach(async ({ page }) => {
        await fixtures(page)
        await page.setViewportSize({ width, height: 900 })
        await page.addInitScript((percent) => {
          const style = document.createElement('style')
          style.textContent = `html { font-size: ${percent}% !important; } nuxt-devtools-frame { display: none !important; }`
          document.addEventListener('DOMContentLoaded', () => document.head.append(style), { once: true })
        }, scale)
      })

      test('announcement cards, detail and editor retain long content', async ({ page }, testInfo) => {
        await page.goto('/announcements')
        const link = page.getByRole('link', { name: title, exact: true })
        await expect(link).toBeVisible({ timeout: 30_000 })
        await expect(page.locator('.announcement-card')).toContainText(ministryName)
        await fits(page)
        await link.click()
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
        await expect(page.getByText('Скрыть после: 31.12.2026')).toBeVisible()
        await expect(page.getByText('Просмотров: 18')).toBeVisible()
        await fits(page)
        await page.getByRole('button', { name: 'Изменить', exact: true }).click()
        await expect(page.locator('[data-test=title]')).toHaveValue(title)
        await expect(page.locator('[data-test=hide-after]')).toHaveValue('2026-12-31')
        await fits(page)
        await page.getByRole('button', { name: 'Сохранить', exact: true }).scrollIntoViewIfNeeded()
        await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeInViewport()
        await page.screenshot({ path: testInfo.outputPath('announcement.png'), fullPage: true })
      })

      test('template filter and nested slot/recurrence fieldsets fit', async ({ page }, testInfo) => {
        await page.goto('/templates')
        const filter = page.locator('[data-test=owner-filter]')
        await filter.selectOption(ministry.id)
        await expect(filter.locator('option:checked')).toHaveText(ministryName)
        await fits(page)
        await page.getByRole('button', { name: 'Создать шаблон' }).click()
        await page.locator('[data-test=title]').fill(title)
        await page.locator('[data-test=owner]').selectOption(ministry.id)
        await page.locator('[data-test=type]').selectOption('biweekly')
        await page.locator('[data-test=anchor]').fill('2026-11-01')
        await page.getByRole('button', { name: 'Добавить слот' }).click()
        await page.locator('[data-test=slot-0-role]').selectOption('r-overflow')
        await page.locator('[data-test=slot-0-label]').fill(ministryName)
        await page.locator('[data-test=slot-0-count]').fill('50')
        await fits(page)
        await expect(page.getByText('События могут быть и раньше опорной даты.', { exact: false })).toBeVisible()
        await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
        await expect(page.getByRole('alert').first()).toContainText(warning)
        await expect(page.locator('[data-test=slot-0-label]')).toHaveValue(ministryName)
        await expect(page.locator('[data-test=slot-0-count]')).toHaveValue('50')
        await expect(page.locator('[data-test=anchor]')).toHaveValue('2026-11-01')
        await fits(page)
        await page.screenshot({ path: testInfo.outputPath('template.png'), fullPage: true })
      })

      test('event slot addition and changes keep dates, counts and warnings', async ({ page }, testInfo) => {
        await page.goto('/events/new')
        await page.locator('[data-test=title]').fill(title)
        await page.locator('[data-test=starts-at]').fill('2026-11-08T10:00')
        await page.locator('[data-test=ends-at]').fill('2026-11-08T12:00')
        await page.getByRole('button', { name: 'Добавить слот' }).click()
        await page.locator('[data-test=slot-0-role]').selectOption('r-overflow')
        await page.locator('[data-test=slot-0-label]').fill(ministryName)
        await page.locator('[data-test=slot-0-count]').fill('50')
        await fits(page)
        await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
        await expect(page.getByRole('alert').first()).toContainText(warning)
        await expect(page.locator('[data-test=slot-0-count]')).toHaveValue('50')
        await expect(page.locator('[data-test=starts-at]')).toHaveValue('2026-11-08T10:00')
        await expect(page.locator('[data-test=ends-at]')).toHaveValue('2026-11-08T12:00')
        await fits(page)
        await page.getByRole('button', { name: 'Убрать слот' }).click()
        await expect(page.getByRole('group', { name: 'Слот 1' })).toHaveCount(0)
        await fits(page)
        await page.screenshot({ path: testInfo.outputPath('event.png'), fullPage: true })
      })
    })
  }
}
