import type { Page, Response } from '@playwright/test'
import type { components } from '../types/api'
import { church, e2e } from './environment'
import {
  addMember, createGlobalRole, createInvitedAccount, createMinistry, expect, expectApiResponse,
  expectNoHorizontalScroll, expectPhoneTabBar, fullName, loginAsAdmin, openSection,
  reloadAuthenticated, runArtisan, test,
} from './fixtures'

type CalendarEvent = components['schemas']['EventResource']
type CalendarTemplate = components['schemas']['EventTemplateResource']
const ministry = 'Календарь — прославление e2e'
const title = 'Воскресное служение — календарь e2e'
const role = 'Вокалист календаря'
const leader = { lastName: 'Календарёв', firstName: 'Сергей', login: 'calendar-leader@e2e.test', globalRole: 'Справочник для лидера календаря e2e' }
const singer = { lastName: 'Календарёва', firstName: 'Анна', login: 'calendar-singer@e2e.test', globalRole: 'Назначенный календаря e2e' }

function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

function churchToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: church.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function sundays(from: string, to: string): string[] {
  const dates: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (new Date(`${day}T00:00:00Z`).getUTCDay() === 0) dates.push(day)
  }
  return dates
}

function calendarResponse(page: Page): Promise<Response> {
  return page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/events'
    && response.request().method() === 'GET' && new URL(response.url()).searchParams.get('scope') === 'church')
}

// Walk the actual calendar months until the full horizon is
// covered. Observe their HTTP responses and verify every rendered civil date.
async function calendarSnapshot(page: Page, templateId: string, until: string): Promise<CalendarEvent[]> {
  const seen = new Map<string, CalendarEvent>()
  let [response] = await Promise.all([calendarResponse(page), openSection(page, 'Календарь', 'Календарь')])
  if (await page.getByRole('button', { name: 'Список', exact: true }).getAttribute('aria-pressed') !== 'true') {
    const date = await page.getByTestId('calendar-date').inputValue(), first = date.slice(0, 7) + '-01'
    const last = new Date(first + 'T00:00:00Z'); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0)
    const url = new URL(response.url())
    if (url.searchParams.get('from') === first && url.searchParams.get('to') === last.toISOString().slice(0, 10)) {
      await page.getByRole('button', { name: 'Список', exact: true }).click()
    } else {
      const [listResponse] = await Promise.all([calendarResponse(page), page.getByRole('button', { name: 'Список', exact: true }).click()])
      response = listResponse
    }
  }
  for (let screen = 0; screen < 10; screen++) {
    expect(response.status()).toBe(200)
    const payload = await response.json() as { data: CalendarEvent[], meta: { last_page: number } }
    expect(payload.meta.last_page, 'the UI response contains the entire test range').toBe(1)
    const events = payload.data.filter(event => event.template_id === templateId)
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(events.length)
    for (const event of events) {
      expect(event.occurrence_date).not.toBeNull()
      await expect(page.locator(`time[datetime="${event.occurrence_date}"]`)).toBeVisible()
      await expect(page.getByRole('link', { name: title, exact: true }).and(page.locator(`[href^="/events/${event.id}?"]`))).toBeVisible()
      seen.set(event.id, event)
    }
    const rangeTo = new URL(response.url()).searchParams.get('to')!
    if (rangeTo >= until) return [...seen.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const [nextResponse] = await Promise.all([calendarResponse(page), page.getByTestId('next-month').click()])
    response = nextResponse
  }
  throw new Error('Calendar navigation did not reach the full eight-week horizon.')
}

async function openMinistryTab(page: Page, name: string, heading: string, endpoints: string[]): Promise<void> {
  await Promise.all([
    ...endpoints.map(endpoint => expectApiResponse(page, 'GET', endpoint, 200)),
    page.getByRole('navigation', { name: 'Разделы служения' }).getByRole('link', { name, exact: true }).click(),
  ])
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
}

// No intercepted HTTP, fake notification or synchronous queue: a real Reverb
// frame is a witness that the isolated Redis worker delivered this assignment.
function observeAssignment(page: Page) {
  const subscribed: string[] = []
  const notifications: { id: string, type: string, category: string, title: string, body: string, url: string }[] = []
  const sockets: string[] = []
  page.on('websocket', (socket) => {
    sockets.push(socket.url())
    socket.on('framereceived', ({ payload }) => {
      const frame = JSON.parse(String(payload))
      if (frame.event === 'pusher_internal:subscription_succeeded') subscribed.push(frame.channel)
      if (frame.event === 'Illuminate\\Notifications\\Events\\BroadcastNotificationCreated') {
        expect(frame.channel).toMatch(/^private-user\./)
        notifications.push(typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data)
      }
    })
  })
  return { subscribed, notifications, sockets }
}

test('a template materializes eight weeks idempotently, a phone leader fills a slot and the assignee is notified', async ({ page, openPhone }, testInfo) => {
  test.setTimeout(300_000)
  const schedule = runArtisan(['schedule:list'])
  expect(schedule).toContain('calendar:materialize')
  expect(schedule).toContain('calendar:send-reminders')
  await testInfo.attach('local-schedule-registration', { body: schedule, contentType: 'text/plain' })
  await loginAsAdmin(page)
  // Directory visibility is an explicit global grant; being a ministry leader
  // does not grant permission to see other people's names.
  await createGlobalRole(page, leader.globalRole, ['Видеть справочник'])
  await createGlobalRole(page, singer.globalRole, [])
  const leaderPhone = await createInvitedAccount(page, openPhone, leader)
  let live!: ReturnType<typeof observeAssignment>
  const singerPhone = await createInvitedAccount(page, async () => {
    const phone = await openPhone()
    live = observeAssignment(phone)
    return phone
  }, singer)
  await expect.poll(() => live.subscribed.filter(channel => channel.startsWith('private-user.')).length, { timeout: 20_000 }).toBeGreaterThan(0)
  expect(live.sockets.some(url => url.startsWith(e2e.webOrigin.replace('http:', 'ws:') + '/app/'))).toBe(true)

  await createMinistry(page, ministry)
  const link = page.getByRole('link', { name: ministry, exact: true })
  const ministryPath = (await link.getAttribute('href'))!
  await Promise.all([expectApiResponse(page, 'GET', ministryPath, 200), link.click()])
  await openMinistryTab(page, 'Роли', 'Роли служения', [ministryPath, `${ministryPath}/roles`])
  await Promise.all([expectApiResponse(page, 'GET', '/permissions', 200), page.getByTestId('create-role').click()])
  await page.getByLabel('Название', { exact: true }).fill(role)
  await Promise.all([
    expectApiResponse(page, 'POST', `${ministryPath}/roles`, 201),
    expectApiResponse(page, 'GET', '/permissions', 200),
    page.getByTestId('save-role').click(),
  ])
  await expect(page.getByRole('button', { name: role, exact: true })).toBeVisible()

  await openMinistryTab(page, 'Участники', 'Участники', [`${ministryPath}/members`, `${ministryPath}/roles`])
  for (const [person, ministryRole] of [[leader, 'Лидер'], [singer, role]] as const) {
    await addMember(page, person.lastName, fullName(person))
    const row = page.getByTestId('member-row').filter({ hasText: fullName(person) })
    await row.getByLabel(ministryRole, { exact: true }).check()
    const saved = page.waitForResponse(response => response.request().method() === 'PUT'
      && new URL(response.url()).pathname.startsWith(`/api/v1${ministryPath}/members/`) && new URL(response.url()).pathname.endsWith('/roles'))
    await row.getByRole('button', { name: 'Сохранить роли' }).click()
    expect((await saved).status()).toBe(200)
    await expect(row.getByRole('list', { name: 'Роли участника', exact: true }).getByText(ministryRole, { exact: true })).toBeVisible()
  }

  await openSection(page, 'Шаблоны', 'Шаблоны')
  await Promise.all([expectApiResponse(page, 'GET', '/calendar/slot-choices', 200), page.getByTestId('new-template').click()])
  await page.getByTestId('owner').selectOption('church')
  await page.getByTestId('title').fill(title)
  await page.getByTestId('start-time').fill('10:00')
  await page.getByTestId('duration').fill('120')
  await page.getByTestId('type').selectOption('weekly')
  await page.getByTestId('weekday').selectOption('7')
  await page.getByTestId('add-slot').click()
  const editor = page.getByRole('region', { name: 'Редактор слотов' })
  await editor.getByRole('combobox', { name: 'Служение', exact: true }).selectOption({ label: ministry })
  await page.getByTestId('slot-0-role').selectOption({ label: role })
  await page.getByTestId('slot-0-count').fill('2')
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/templates' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  const createdResponse = await created
  expect(createdResponse.status()).toBe(201)
  const template = ((await createdResponse.json()) as { data: CalendarTemplate }).data
  await expect(page).toHaveURL(`/templates/${template.id}`)
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()

  const before = churchToday()
  const firstOutput = runArtisan(['calendar:materialize'])
  const after = churchToday()
  const detail = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/templates/${template.id}` && response.request().method() === 'GET')
  await reloadAuthenticated(page)
  const materialized = ((await (await detail).json()) as { data: CalendarTemplate }).data
  const until = materialized.generated_until!
  // Accept a command spanning local midnight, while independently proving the
  // configured 56-day horizon. Sunday start legitimately yields nine Sundays.
  expect([addDays(before, 56), addDays(after, 56)]).toContain(until)
  const expectedDates = sundays(addDays(until, -56), until)
  const first = await calendarSnapshot(page, template.id, until)
  expect(first.map(event => event.occurrence_date)).toEqual(expectedDates)
  expect(firstOutput).toContain(`Создано событий: ${expectedDates.length}.`)
  for (const event of first) {
    expect(new Intl.DateTimeFormat('en-GB', { timeZone: church.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(event.starts_at))).toBe('10:00')
    expect(new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()).toBe(120 * 60_000)
    expect(event.slots).toHaveLength(1)
    expect(event.slots[0]).toMatchObject({ label: role, required_count: 2, filled_count: 0 })
  }

  const secondOutput = runArtisan(['calendar:materialize'])
  expect(secondOutput).toContain('Создано событий: 0.')
  await openSection(page, 'Шаблоны', 'Шаблоны')
  const second = await calendarSnapshot(page, template.id, until)
  expect(second, 'a repeat command preserves all occurrence IDs, fields and slots').toEqual(first)
  await testInfo.attach('eight-week-materialization', { body: JSON.stringify({ timezone: church.timezone, horizonWeeks: 8, until, expectedDates, first, second, firstOutput, secondOutput }, null, 2), contentType: 'application/json' })

  await leaderPhone.setViewportSize({ width: 390, height: 844 })
  await expect(async () => {
    await reloadAuthenticated(leaderPhone)
    await leaderPhone.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Ещё', exact: true }).click()
    const more = leaderPhone.getByRole('dialog', { name: 'Ещё', exact: true })
    await expect(more.getByRole('link', { name: 'Служения', exact: true })).toBeVisible({ timeout: 2_000 })
    await more.getByRole('button', { name: 'Закрыть', exact: true }).click()
  }).toPass({ timeout: 30_000 })
  await openSection(leaderPhone, 'Календарь', 'Календарь')
  await expectPhoneTabBar(leaderPhone)
  await expectNoHorizontalScroll(leaderPhone, 'календарь')
  const event = first.find(event => new Date(event.ends_at).getTime() > Date.now())!
  expect(event, 'a future materialized occurrence is available').toBeTruthy()
  await leaderPhone.getByTestId('calendar-date').fill(event.occurrence_date!)
  await Promise.all([
    expectApiResponse(leaderPhone, 'GET', `/events/${event.id}`, 200),
    leaderPhone.getByRole('link', { name: title, exact: true }).and(leaderPhone.locator(`[href^="/events/${event.id}?"]`)).click(),
  ])
  const slotId = event.slots[0]!.id
  await expect(async () => {
    await reloadAuthenticated(leaderPhone)
    await expect(leaderPhone.getByTestId(`assign-${slotId}`)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await expect(leaderPhone.getByTestId('edit-event')).toHaveCount(0)
  await Promise.all([expectApiResponse(leaderPhone, 'GET', `/slots/${slotId}/candidates`, 200), leaderPhone.getByTestId(`assign-${slotId}`).click()])
  const dialog = leaderPhone.getByRole('dialog', { name: `Назначить: ${role}` })
  await expectNoHorizontalScroll(leaderPhone, 'кандидаты в слот')
  await Promise.all([
    expectApiResponse(leaderPhone, 'POST', `/slots/${slotId}/assignments`, 201),
    expectApiResponse(leaderPhone, 'GET', `/events/${event.id}`, 200),
    dialog.getByRole('button', { name: fullName(singer), exact: true }).click(),
  ])
  await expect(dialog.getByRole('status').filter({ hasText: 'Назначение создано.' })).toBeVisible()
  await dialog.getByTestId('close-assign').click()
  await expect(dialog).toBeHidden()
  await expect(leaderPhone.getByTestId(`slot-${slotId}-count`)).toHaveText('1 из 2')
  await expect(leaderPhone.getByRole('list', { name: 'Назначенные' }).getByText(fullName(singer), { exact: true })).toBeVisible()
  await expectNoHorizontalScroll(leaderPhone, 'заполненный слот')

  await expect.poll(() => live.notifications.find(notification => notification.title === 'Вас назначили' && notification.url === `/events/${event.id}`), { timeout: 20_000 }).toBeTruthy()
  const notification = live.notifications.find(notification => notification.url === `/events/${event.id}`)!
  expect(notification).toMatchObject({ type: 'notification.created', category: 'assignments', title: 'Вас назначили' })
  expect(notification.body).toContain(title)
  await expect(singerPhone.getByTestId('notification-badge')).toHaveText('1')
  await openSection(singerPhone, 'Уведомления', 'Уведомления')
  await expect(singerPhone.getByTestId(`notification-${notification.id}`)).toContainText('Вас назначили')
  await Promise.all([
    expectApiResponse(singerPhone, 'POST', '/notifications/read', 200),
    expectApiResponse(singerPhone, 'GET', `/events/${event.id}`, 200),
    singerPhone.getByTestId(`notification-${notification.id}`).click(),
  ])
  await expect(singerPhone).toHaveURL(`/events/${event.id}`)
  await expect(singerPhone.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  await expect(singerPhone.getByTestId(`slot-${slotId}-count`)).toHaveText('1 из 2')
  await testInfo.attach('queued-assignment-notification', { body: JSON.stringify({ viewport: leaderPhone.viewportSize(), eventId: event.id, slotId, sockets: live.sockets, notification }, null, 2), contentType: 'application/json' })
})
