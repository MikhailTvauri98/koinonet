import type { Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import type { components } from '../types/api'
import { church, credentials } from './environment'
import { createMinistry, expect, expectApiResponse, expectNoHorizontalScroll, fullName, loginAsAdmin, openSection, test, visitAuthenticated } from './fixtures'

type CalendarEvent = components['schemas']['EventResource']
test.use({ timezoneId: 'America/Los_Angeles' })

async function reachable(page: Page, selector: string) {
  const control = page.locator(selector)
  await control.focus()
  await expect(control).toBeFocused()
  await control.evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expect(control).toBeInViewport({ ratio: 1 })
  expect(await control.evaluate(element => {
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return Boolean(hit && (hit === element || element.contains(hit)))
  })).toBe(true)
}

// Nine audit paths through the real API. The only injected responses are named
// 503 failures; every successful create/read/assignment/cancellation reaches PHP.
for (const theme of ['dark', 'light'] as const) {
  test(`calendar audit real API: ${theme}, year boundary, midnight, conflict and read recovery`, async ({ page }, info) => {
    test.setTimeout(360_000)
    await loginAsAdmin(page)
    await visitAuthenticated(page, '/settings/appearance')
    await page.getByRole('radio', { name: theme === 'light' ? 'Светлая' : 'Тёмная', exact: true }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await createMinistry(page, `Приёмка календаря ${theme}`)
    const ministryPath = await page.getByRole('link', { name: `Приёмка календаря ${theme}`, exact: true }).getAttribute('href')
    const ministryId = ministryPath!.split('/').at(-1)!
    await page.setViewportSize({ width: 390, height: 844 })
    await openSection(page, 'Календарь', 'Календарь')
    await page.getByTestId('calendar-date').fill('2030-12-31')
    await page.getByTestId('next-month').click()
    await expect(page.getByTestId('calendar-date')).toHaveValue('2031-01-31')
    await page.getByTestId('calendar-today').click()
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: church.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    await expect(page.getByTestId('calendar-date')).toHaveValue(today)
    await page.getByTestId('calendar-date').fill('2030-12-31')
    await page.getByRole('button', { name: 'Список', exact: true }).click()
    await page.getByTestId('scope-mine').click()
    await expect(page.getByTestId('scope-mine')).toHaveAttribute('aria-pressed', 'true')
    const returnTo = '/calendar?date=2030-12-31&view=list&scope=mine'

    async function createMidnightEvent(title: string, start: string, end: string, failures: boolean): Promise<CalendarEvent> {
      await page.getByRole('link', { name: 'Создать событие', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Новое событие', exact: true })).toBeVisible()
      await expect(page.getByTestId('starts-date')).toHaveValue('2030-12-31')
      await expect(page.getByTestId('ends-date')).toHaveValue('2030-12-31')
      await page.getByTestId('title').fill(title)
      await page.getByTestId('starts-time').fill(start)
      await page.getByTestId('ends-time').fill(end)
      if (failures) {
        await page.getByTestId('save-event-top').click()
        await expect(page.getByTestId('ends-time')).toBeFocused()
        await expect(page.getByTestId('ends-time')).toHaveAttribute('aria-invalid', 'true')
        await expect(page.getByTestId('title')).toHaveValue(title)
      }
      await page.getByTestId('ends-date').fill('2031-01-01')
      await page.getByTestId('add-slot').click()
      await page.getByTestId('slot-0-label').fill('Помощь на встрече')
      if (failures) {
        await page.getByTestId('owner').selectOption(ministryId)
        await expect(page.getByRole('dialog', { name: 'Сменить владельца события?', exact: true })).toBeVisible()
        await page.getByTestId('keep-owner').click()
        await expect(page.getByTestId('owner')).toHaveValue('church')
        await expect(page.getByTestId('slot-0-label')).toHaveValue('Помощь на встрече')
        const failedCreate = async (route: import('@playwright/test').Route) => route.request().method() === 'POST'
          ? route.fulfill({ status: 503, json: { message: 'Не удалось сохранить событие. Попробуйте ещё раз.' } }) : route.fallback()
        await page.route('**/api/v1/events', failedCreate)
        await Promise.all([expectApiResponse(page, 'POST', '/events', 503), page.getByTestId('save-event-top').click()])
        await expect(page.getByTestId('save-error')).toBeVisible()
        await expect(page.getByTestId('title')).toHaveValue(title)
        await expect(page.getByTestId('slot-0-label')).toHaveValue('Помощь на встрече')
        await expect(page.getByTestId('ends-date')).toHaveValue('2031-01-01')
        await page.unroute('**/api/v1/events', failedCreate)
      }
      await reachable(page, '[data-test=save-event-top]')
      await expectNoHorizontalScroll(page, 'создание через полночь')
      const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/events' && response.request().method() === 'POST')
      await page.getByTestId('save-event-top').click()
      const response = await created
      expect(response.status()).toBe(201)
      const event = ((await response.json()) as { data: CalendarEvent }).data
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
      expect(new Date(event.starts_at).toISOString()).toBe(`2030-12-31T${start === '23:00' ? '20:00' : '20:30'}:00.000Z`)
      expect(new Date(event.ends_at).toISOString()).toBe(`2030-12-31T${end === '01:30' ? '22:30' : '22:00'}:00.000Z`)
      expect(event.slots).toHaveLength(1)
      expect(await page.getByTestId('calendar-return').getAttribute('href')).toBe(returnTo)
      return event
    }

    const first = await createMidnightEvent(`Приёмка — первая встреча ${theme}`, '23:00', '01:30', true)
    const firstSlot = first.slots[0]!.id
    await Promise.all([expectApiResponse(page, 'GET', `/slots/${firstSlot}/candidates`, 200), page.getByTestId(`assign-${firstSlot}`).click()])
    let dialog = page.getByRole('dialog', { name: 'Назначить: Помощь на встрече', exact: true })
    await Promise.all([expectApiResponse(page, 'GET', `/slots/${firstSlot}/candidates`, 200), dialog.getByTestId('search').fill(fullName(credentials.admin))])
    await Promise.all([
      expectApiResponse(page, 'POST', `/slots/${firstSlot}/assignments`, 201), expectApiResponse(page, 'GET', `/events/${first.id}`, 200),
      dialog.locator('.candidates button').filter({ hasText: fullName(credentials.admin) }).click(),
    ])
    await dialog.getByTestId('close-assign').click()
    await expect(page.getByTestId('my-participation')).toContainText('Вы назначены')
    await expect(page.getByTestId(`slot-${firstSlot}-count`)).toHaveText('1 из 1')
    await page.getByTestId('calendar-return').click()
    await expect(page.getByTestId('calendar-date')).toHaveValue('2030-12-31')
    await expect(page.getByTestId('scope-mine')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('link', { name: first.title, exact: true })).toBeVisible()
    const second = await createMidnightEvent(`Приёмка — пересечение ${theme}`, '23:30', '01:00', false)
    const secondSlot = second.slots[0]!.id
    await Promise.all([expectApiResponse(page, 'GET', `/slots/${secondSlot}/candidates`, 200), page.getByTestId(`assign-${secondSlot}`).click()])
    dialog = page.getByRole('dialog', { name: 'Назначить: Помощь на встрече', exact: true })
    await Promise.all([expectApiResponse(page, 'GET', `/slots/${secondSlot}/candidates`, 200), dialog.getByTestId('search').fill(fullName(credentials.admin))])
    const candidate = dialog.locator('.candidates button').filter({ hasText: fullName(credentials.admin) })
    await expect(candidate).toContainText(first.title)
    const conflict = candidate.getByTestId('conflict').filter({ hasText: first.title })
    await expect(conflict).toHaveCount(1)
    await expect(conflict.locator('time')).toHaveCount(2)
    await expect(conflict.locator('time').nth(0)).toHaveAttribute('datetime', first.starts_at)
    await expect(conflict.locator('time').nth(1)).toHaveAttribute('datetime', first.ends_at)
    await page.screenshot({ path: info.outputPath(`${theme}-390-real-conflict.png`) })
    let failedRead = true, assignmentWrites = 0, failedReadResponses = 0
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/v1/slots/${secondSlot}/assignments`) assignmentWrites++ })
    await page.route(`**/api/v1/events/${second.id}`, (route) => {
      if (failedRead && route.request().method() === 'GET') {
        failedReadResponses++
        return route.fulfill({ status: 503, json: { message: 'Недоступно при приёмке.' } })
      }
      return route.fallback()
    })
    const assigned = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/slots/${secondSlot}/assignments` && response.request().method() === 'POST')
    await candidate.click()
    const assignment = await assigned
    expect(assignment.status()).toBe(201)
    const assignedBody = await assignment.json()
    expect(assignedBody.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'time_conflict' })]))
    await expect(dialog.getByRole('status').filter({ hasText: 'Назначение создано.' })).toBeVisible()
    await expect(dialog.getByTestId('warnings')).toContainText(first.title)
    await expect(candidate).toBeDisabled()
    await dialog.getByTestId('close-assign').click()
    await expect(page.getByTestId('retry-assignments')).toBeVisible()
    failedRead = false
    await Promise.all([expectApiResponse(page, 'GET', `/events/${second.id}`, 200), page.getByTestId('retry-assignments').click()])
    expect(assignmentWrites).toBe(1)
    expect(failedReadResponses).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('my-participation')).toContainText('Вы назначены')
    await expect(page.getByTestId(`slot-${secondSlot}-count`)).toHaveText('1 из 1')

    await page.getByTestId('edit-event').click()
    await page.getByTestId('title').fill('Несохранённое название')
    await page.getByTestId('cancel-edit').click()
    await page.getByTestId('discard-edit').click()
    await expect(page.getByRole('heading', { level: 1, name: second.title, exact: true })).toBeVisible()
    await page.getByTestId('cancel-event').click()
    await page.getByTestId('reason').fill('Встречу перенесли после проверки')
    await Promise.all([
      expectApiResponse(page, 'POST', `/events/${second.id}/cancel`, 200), expectApiResponse(page, 'GET', `/events/${second.id}`, 200),
      page.getByTestId('confirm-cancel').click(),
    ])
    await expect(page.getByTestId(`cancelled-${second.id}`)).toContainText('Встречу перенесли после проверки')
    await expect(page.getByTestId(`assign-${secondSlot}`)).toHaveCount(0)
    await visitAuthenticated(page, `/events/${first.id}`)
    expect(await page.getByTestId('calendar-return').getAttribute('href')).toBe('/calendar')
    await page.setViewportSize({ width: 320, height: 390 })
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await reachable(page, `[data-test=assign-${firstSlot}]`)
    await expectNoHorizontalScroll(page, 'реальная карточка 320×390 при200%')
    await page.screenshot({ path: info.outputPath(`${theme}-320x390-200-real-slot-action.png`) })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.addStyleTag({ content: 'html { font-size: 100% !important; }' })
    await page.screenshot({ path: info.outputPath(`${theme}-1440-real-participation.png`), fullPage: true })
    const evidencePath = info.outputPath('calendar-audit-real-api.json')
    await writeFile(evidencePath, JSON.stringify({ theme, deviceTimezone: 'America/Los_Angeles', churchTimezone: church.timezone, auditScenarios: [1, 2, 3, 4, 5, 6, 7, 8, 9], first, second, assignment: assignedBody, assignmentWrites, failedReadResponses, failureInjection: 'one503 create; event reads503 until explicit retry; successful operations use real API' }, null, 2))
    await info.attach('calendar-audit-real-api', { path: evidencePath, contentType: 'application/json' })
  })
}
