import type { Page, Response } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import type { components } from '../types/api'
import { church, credentials } from './environment'
import {
  addMember, createGlobalRole, createInvitedAccount, createMinistry, expect, expectApiResponse, fullName,
  loginAsAdmin, openSection, reloadAuthenticated, runArtisan, test, visitAuthenticated, type NewPerson,
} from './fixtures'

// Сценарии приёмки фазы 8 (docs/design/phase-8/spec.md, «Приёмка»), которые
// требуют настоящего API: 1 — главная прихожанина, 6 — окно слота по флагам
// can_fill/can_manage, 7 — файл .ics одного события, 10 — цвет служения,
// 11 — короткое имя. Устройство в America/Los_Angeles, церковь в Europe/Moscow:
// всё, что показывается, считается в поясе церкви.

type CalendarEvent = components['schemas']['EventResource']
type Assignment = components['schemas']['EventAssignmentResource']
type ChatMessage = components['schemas']['MessageResource']
type ChatSummary = { id: string, title: string }
test.use({ timezoneId: 'America/Los_Angeles' })

function shortName(person: NewPerson): string {
  return `${person.firstName} ${person.lastName}`
}

function churchDay(offset: number): string {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: church.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function icsMoment(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

async function expectDeviceZone(page: Page): Promise<void> {
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('America/Los_Angeles')
}

async function openMinistryTab(page: Page, name: string, ministryName: string, endpoints: string[]): Promise<void> {
  const tab = page.getByRole('navigation', { name: 'Разделы служения' }).getByRole('link', { name, exact: true })
  await Promise.all([...endpoints.map(endpoint => expectApiResponse(page, 'GET', endpoint, 200)), tab.click()])
  await expect(tab).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { level: 1, name: ministryName, exact: true })).toBeVisible()
}

// На вкладке «Участники»: роль служения выдаётся в окне участника.
async function grantMinistryRole(page: Page, ministryPath: string, person: NewPerson, role: string): Promise<void> {
  const row = page.getByTestId('member-row').filter({ hasText: fullName(person) })
  await row.getByTestId('open-member').click()
  const dialog = page.getByRole('dialog', { name: 'Участник служения', exact: true })
  await dialog.getByLabel(role, { exact: true }).check()
  const saved = page.waitForResponse(response => response.request().method() === 'PUT'
    && new URL(response.url()).pathname.startsWith(`/api/v1${ministryPath}/members/`) && new URL(response.url()).pathname.endsWith('/roles'))
  await dialog.getByRole('button', { name: 'Сохранить роли' }).click()
  expect((await saved).status()).toBe(200)
  await dialog.getByTestId('close-member').click()
  await expect(row.locator('.member-row__roles')).toHaveText(role)
}

interface EventDraft {
  title: string
  date: string
  start: string
  end: string
  location?: string
  description?: string
  visibility?: 'Вся церковь' | 'Только назначенные'
  slots?: { role?: string, label?: string, count: number }[]
}

// Событие создаётся из календаря на компьютере, как это делает администратор.
async function createEvent(page: Page, draft: EventDraft): Promise<CalendarEvent> {
  await openSection(page, 'Календарь', 'Календарь')
  await page.getByTestId('calendar-date').fill(draft.date)
  // Редактор сразу загружает роли для слотов.
  await Promise.all([expectApiResponse(page, 'GET', '/calendar/slot-choices', 200), page.getByRole('link', { name: 'Создать событие', exact: true }).click()])
  await expect(page.getByRole('heading', { level: 1, name: 'Новое событие', exact: true })).toBeVisible()
  await expect(page.getByTestId('starts-date')).toHaveValue(draft.date)
  await page.getByTestId('owner').selectOption('church')
  await page.getByTestId('title').fill(draft.title)
  if (draft.description) await page.getByRole('textbox', { name: 'Описание', exact: true }).fill(draft.description)
  if (draft.location) await page.getByTestId('location').fill(draft.location)
  await page.getByTestId('starts-time').fill(draft.start)
  await page.getByTestId('ends-date').fill(draft.date)
  await page.getByTestId('ends-time').fill(draft.end)
  if (draft.visibility) await page.getByRole('combobox', { name: 'Кто видит событие', exact: true }).selectOption({ label: draft.visibility })
  for (const [index, slot] of (draft.slots ?? []).entries()) {
    await page.getByTestId('add-slot').click()
    if (slot.role) await page.getByTestId(`slot-${index}-role`).selectOption({ label: slot.role })
    if (slot.label) await page.getByTestId(`slot-${index}-label`).fill(slot.label)
    await page.getByTestId(`slot-${index}-count`).fill(String(slot.count))
  }
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/events' && response.request().method() === 'POST')
  await page.getByTestId('save-event').click()
  const response = await created
  expect(response.status()).toBe(201)
  const event = ((await response.json()) as { data: CalendarEvent }).data
  await expect(page.getByRole('heading', { level: 1, name: draft.title, exact: true })).toBeVisible()
  return event
}

async function eventFromResponse(response: Promise<Response>): Promise<CalendarEvent> {
  const settled = await response
  expect(settled.status()).toBe(200)
  return ((await settled.json()) as { data: CalendarEvent }).data
}

function eventRead(page: Page, id: string): Promise<Response> {
  return page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/events/${id}` && response.request().method() === 'GET')
}

test('phase 8: parishioner home, slot window by flags and the single-event calendar file', async ({ page, openPhone }, testInfo) => {
  test.setTimeout(420_000)
  const ministry = 'Фаза 8 — служение встреч e2e'
  const role = 'Чтец фазы 8'
  const leader = { lastName: 'Ведущий', firstName: 'Павел', login: 'phase8-leader@e2e.test', globalRole: 'Справочник фазы 8 e2e' }
  const parishioner = { lastName: 'Прихожанова', firstName: 'Вера', login: 'phase8-parishioner@e2e.test', globalRole: 'Прихожанин фазы 8 e2e' }
  const tomorrow = churchDay(1)

  await loginAsAdmin(page)
  await createGlobalRole(page, leader.globalRole, ['Видеть справочник'])
  // Прихожанин без справочника: чужие имена ему скрыты.
  await createGlobalRole(page, parishioner.globalRole, [])
  const leaderPhone = await createInvitedAccount(page, openPhone, leader)
  const parishPhone = await createInvitedAccount(page, openPhone, parishioner)
  await expectDeviceZone(page)
  await expectDeviceZone(parishPhone)

  await createMinistry(page, ministry)
  const ministryLink = page.getByRole('link', { name: ministry, exact: true })
  const ministryPath = (await ministryLink.getAttribute('href'))!
  await Promise.all([expectApiResponse(page, 'GET', ministryPath, 200), ministryLink.click()])
  await openMinistryTab(page, 'Роли', ministry, [ministryPath, `${ministryPath}/roles`])
  await Promise.all([expectApiResponse(page, 'GET', '/permissions', 200), page.getByTestId('create-role').click()])
  await page.getByLabel('Название', { exact: true }).fill(role)
  await Promise.all([expectApiResponse(page, 'POST', `${ministryPath}/roles`, 201), expectApiResponse(page, 'GET', '/permissions', 200), page.getByTestId('save-role').click()])
  await openMinistryTab(page, 'Участники', ministry, [`${ministryPath}/members`, `${ministryPath}/roles`])
  await addMember(page, leader.lastName, fullName(leader))
  await grantMinistryRole(page, ministryPath, leader, 'Лидер')
  await addMember(page, parishioner.lastName, fullName(parishioner))
  await grantMinistryRole(page, ministryPath, parishioner, role)

  // Церковное событие со слотом роли служения: лидер служения может назначать
  // (can_fill), но не управляет событием (can_manage). Второй слот — свободный.
  const meeting = await createEvent(page, {
    title: 'Вечер чтения e2e', date: tomorrow, start: '18:00', end: '20:00', location: 'Малый зал',
    description: 'Читаем и обсуждаем вместе.', slots: [{ role, count: 2 }, { label: 'Дежурный e2e', count: 1 }],
  })
  const readerSlot = meeting.slots.find(slot => slot.role !== null)!
  const dutySlot = meeting.slots.find(slot => slot.role === null)!
  expect(new Date(meeting.starts_at).toISOString()).toBe(`${tomorrow}T15:00:00.000Z`)
  expect(new Date(meeting.ends_at).toISOString()).toBe(`${tomorrow}T17:00:00.000Z`)
  // Карточка управляющего: опасных кнопок на экране нет, «Отменить событие» — в меню «⋯».
  await expect(page.locator('.ui-button--danger')).toHaveCount(0)
  await page.getByTestId('event-menu').click()
  const eventMenu = page.getByRole('dialog', { name: 'Действия с событием', exact: true })
  await expect(eventMenu.getByTestId('cancel-event')).toHaveClass(/ui-button--danger/)
  await eventMenu.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(eventMenu).toBeHidden()

  const closed = await createEvent(page, { title: 'Закрытая встреча e2e', date: tomorrow, start: '12:00', end: '13:00', visibility: 'Только назначенные' })
  expect(closed.visibility).toBe('assigned')

  // Сценарий 1, без назначений: блока «Вы служите» нет, неделя показывает событие по времени церкви.
  await visitAuthenticated(parishPhone, '/')
  const parishWeek = parishPhone.getByRole('region', { name: 'На этой неделе', exact: true })
  const parishRow = parishWeek.getByTestId('week-event').filter({ hasText: meeting.title })
  await expect(parishRow).toBeVisible()
  await expect(parishRow).toContainText('18:00')
  await expect(parishRow).toContainText('Малый зал')
  await expect(parishWeek.getByTestId(`week-mine-${meeting.id}`)).toHaveCount(0)
  await expect(parishWeek.getByText(closed.title)).toHaveCount(0)
  await expect(parishPhone.getByRole('region', { name: 'Вы служите', exact: true })).toHaveCount(0)
  await parishPhone.screenshot({ path: testInfo.outputPath('home-parishioner-without-assignment.png'), fullPage: true })

  // Сценарий 7, отказ: файл недоступного события получает тот же ответ, что и само событие.
  const asParishioner = { headers: { Accept: 'application/json', Referer: parishPhone.url() } }
  const closedEvent = await parishPhone.request.get(`/api/v1/events/${closed.id}`, asParishioner)
  const closedFile = await parishPhone.request.get(`/api/v1/events/${closed.id}/ics`, asParishioner)
  expect([403, 404]).toContain(closedEvent.status())
  expect(closedFile.status()).toBe(closedEvent.status())
  expect(closedFile.headers()['content-type'] ?? '').not.toContain('text/calendar')

  // Сценарий 6: лидер с can_fill без can_manage открывает окно слота с главной.
  await leaderPhone.setViewportSize({ width: 390, height: 844 })
  await expectDeviceZone(leaderPhone)
  await visitAuthenticated(leaderPhone, '/')
  const leaderRow = leaderPhone.getByRole('region', { name: 'На этой неделе', exact: true }).getByRole('link', { name: meeting.title, exact: true })
  await Promise.all([expectApiResponse(leaderPhone, 'GET', `/events/${meeting.id}`, 200), leaderRow.click()])
  // Права лидера пересчитывает очередь; как человек, он обновляет страницу.
  await expect(async () => {
    await reloadAuthenticated(leaderPhone)
    await expect(leaderPhone.getByTestId(`slot-row-${readerSlot.id}`)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await expect(leaderPhone.getByTestId('edit-event')).toHaveCount(0)
  await expect(leaderPhone.getByTestId('event-menu')).toHaveCount(0)
  await expect(leaderPhone.locator('.ui-button--danger')).toHaveCount(0)
  // Свободный слот без роли лидеру не принадлежит: строка не нажимается.
  await expect(leaderPhone.getByTestId(`slot-row-${dutySlot.id}`)).toHaveCount(0)
  await expect(leaderPhone.locator('.slot').filter({ hasText: 'Дежурный e2e' })).toBeVisible()

  await leaderPhone.getByTestId(`slot-row-${readerSlot.id}`).click()
  const slotDialog = leaderPhone.getByRole('dialog', { name: `Слот: ${role}`, exact: true })
  await expect(slotDialog.getByTestId(`dialog-assign-${readerSlot.id}`)).toBeVisible()
  await expect(slotDialog.getByTestId(`edit-slot-${readerSlot.id}`)).toHaveCount(0)
  await expect(slotDialog.getByTestId(`remove-slot-${readerSlot.id}`)).toHaveCount(0)
  await expect(slotDialog.getByRole('button', { name: 'Изменить слот', exact: true })).toHaveCount(0)
  await expect(slotDialog.getByRole('button', { name: 'Убрать слот', exact: true })).toHaveCount(0)
  await expect(slotDialog.locator('.ui-button--danger')).toHaveCount(0)
  await Promise.all([expectApiResponse(leaderPhone, 'GET', `/slots/${readerSlot.id}/candidates`, 200), slotDialog.getByTestId(`dialog-assign-${readerSlot.id}`).click()])
  let assignDialog = leaderPhone.getByRole('dialog', { name: `Назначить: ${role}`, exact: true })
  const firstWrite = leaderPhone.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/slots/${readerSlot.id}/assignments` && response.request().method() === 'POST')
  const firstRead = eventRead(leaderPhone, meeting.id)
  await assignDialog.getByRole('button', { name: fullName(parishioner), exact: true }).click()
  expect((await firstWrite).status()).toBe(201)
  const firstAssignment = ((await (await firstWrite).json()) as { data: Assignment }).data
  await eventFromResponse(firstRead)
  await expect(assignDialog.getByRole('status').filter({ hasText: 'Назначение создано.' })).toBeVisible()
  await assignDialog.getByTestId('close-assign').click()
  await expect(assignDialog).toBeHidden()
  await expect(slotDialog.getByRole('list', { name: 'Назначенные' })).toContainText(shortName(parishioner))

  // Снятие назначения — только через подтверждение.
  await slotDialog.getByTestId(`remove-assignment-${firstAssignment.id}`).click()
  const confirmRemoval = leaderPhone.getByRole('dialog', { name: 'Подтверждение снятия назначения', exact: true })
  await expect(confirmRemoval).toContainText(fullName(parishioner))
  await expect(confirmRemoval.getByTestId('confirm-remove-assignment')).toHaveClass(/ui-button--danger/)
  const removedRead = eventRead(leaderPhone, meeting.id)
  await Promise.all([expectApiResponse(leaderPhone, 'DELETE', `/assignments/${firstAssignment.id}`, 204), confirmRemoval.getByTestId('confirm-remove-assignment').click()])
  const afterRemoval = await eventFromResponse(removedRead)
  expect(afterRemoval.slots.find(slot => slot.id === readerSlot.id)!.assignments).toHaveLength(0)
  await expect(confirmRemoval).toBeHidden()
  await expect(slotDialog.getByTestId(`remove-assignment-${firstAssignment.id}`)).toHaveCount(0)
  await slotDialog.getByTestId('close-slot-dialog').click()
  await expect(slotDialog).toBeHidden()
  await expect(leaderPhone.getByTestId(`slot-${readerSlot.id}-count`)).toHaveText('0 из 2')

  // Повторное назначение тихой кнопкой «+ Назначить» в строке слота.
  await Promise.all([expectApiResponse(leaderPhone, 'GET', `/slots/${readerSlot.id}/candidates`, 200), leaderPhone.getByTestId(`assign-${readerSlot.id}`).click()])
  assignDialog = leaderPhone.getByRole('dialog', { name: `Назначить: ${role}`, exact: true })
  await Promise.all([
    expectApiResponse(leaderPhone, 'POST', `/slots/${readerSlot.id}/assignments`, 201),
    expectApiResponse(leaderPhone, 'GET', `/events/${meeting.id}`, 200),
    assignDialog.getByRole('button', { name: fullName(parishioner), exact: true }).click(),
  ])
  await assignDialog.getByTestId('close-assign').click()
  await expect(leaderPhone.getByTestId(`slot-row-${readerSlot.id}`)).toContainText(shortName(parishioner))
  await expect(leaderPhone.getByTestId(`slot-${readerSlot.id}-count`)).toHaveText('1 из 2')
  await leaderPhone.screenshot({ path: testInfo.outputPath('event-leader-can-fill.png'), fullPage: true })

  // Сценарий 1, с назначением: «Вы служите» идёт первым, в неделе метка «Вы».
  await visitAuthenticated(parishPhone, '/')
  const serving = parishPhone.getByRole('region', { name: 'Вы служите', exact: true })
  await expect(serving).toBeVisible()
  await expect(serving.getByRole('link', { name: meeting.title, exact: true })).toBeVisible()
  await expect(serving).toContainText(role)
  await expect(parishWeek.getByTestId(`week-mine-${meeting.id}`)).toHaveText('Вы')
  const servingBox = (await serving.boundingBox())!, weekBox = (await parishWeek.boundingBox())!
  expect(servingBox.y).toBeLessThan(weekBox.y)
  await parishPhone.screenshot({ path: testInfo.outputPath('home-parishioner-serving.png'), fullPage: true })

  // Сценарий 7: «В календарь» скачивает один VEVENT в UTC со своими слотами.
  const opened = eventRead(parishPhone, meeting.id)
  await serving.getByRole('link', { name: 'Открыть', exact: true }).click()
  const parishView = await eventFromResponse(opened)
  await expect(parishPhone.getByRole('heading', { level: 1, name: meeting.title, exact: true })).toBeVisible()
  const participation = parishPhone.getByTestId('my-participation')
  await expect(participation).toContainText(`Вы служите: ${role}`)
  await expect(parishPhone.locator('.event-head__when')).toContainText('18:00–20:00')
  await expect(parishPhone.getByText('Время церкви · Europe/Moscow', { exact: true })).toBeVisible()
  await expect(parishPhone.locator('.ui-button--danger')).toHaveCount(0)
  await expect(parishPhone.getByTestId(`slot-row-${readerSlot.id}`)).toHaveCount(0)
  await expect(parishPhone.locator('.slot').filter({ hasText: role })).toContainText(`${shortName(parishioner)} · вы`)
  const [download] = await Promise.all([parishPhone.waitForEvent('download'), participation.getByTestId('add-to-calendar').click()])
  expect(download.suggestedFilename()).toBe(`event-${meeting.id}.ics`)
  const file = (await readFile((await download.path())!, 'utf8')).replace(/\r?\n[ \t]/g, '')
  expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  expect(file).toMatch(new RegExp(`^DTSTART:${icsMoment(meeting.starts_at)}\\r?$`, 'm'))
  expect(file).toMatch(new RegExp(`^DTEND:${icsMoment(meeting.ends_at)}\\r?$`, 'm'))
  expect(file).toMatch(/^SUMMARY:Вечер чтения e2e\r?$/m)
  expect(file).toContain(`Слоты: ${role}`)
  expect(file).toContain('Читаем и обсуждаем вместе.')
  expect(file).not.toContain('Дежурный e2e')
  expect(file).not.toContain(parishioner.lastName)

  // Сценарий 6, управляющий: «Убрать слот» — в окне слота и только с подтверждением.
  await visitAuthenticated(page, `/events/${meeting.id}`)
  await expect(page.locator('.ui-button--danger')).toHaveCount(0)
  await page.getByTestId(`slot-row-${dutySlot.id}`).click()
  const dutyDialog = page.getByRole('dialog', { name: 'Слот: Дежурный e2e', exact: true })
  await expect(dutyDialog.getByTestId(`edit-slot-${dutySlot.id}`)).toBeVisible()
  await dutyDialog.getByTestId(`remove-slot-${dutySlot.id}`).click()
  const confirmSlot = page.getByRole('dialog', { name: 'Убрать слот?', exact: true })
  await expect(confirmSlot).toContainText('Убрать слот и снять все его назначения?')
  const slotRemovedRead = eventRead(page, meeting.id)
  await Promise.all([expectApiResponse(page, 'DELETE', `/slots/${dutySlot.id}`, 204), confirmSlot.getByTestId('confirm-remove-slot').click()])
  const afterSlot = await eventFromResponse(slotRemovedRead)
  expect(afterSlot.slots.map(slot => slot.id)).toEqual([readerSlot.id])
  await expect(page.getByTestId(`slot-row-${dutySlot.id}`)).toHaveCount(0)
  await expect(page.locator('.ui-button--danger')).toHaveCount(0)

  const evidencePath = testInfo.outputPath('phase-8-event-flow.json')
  await writeFile(evidencePath, JSON.stringify({
    deviceTimezone: 'America/Los_Angeles', churchTimezone: church.timezone, scenarios: [1, 6, 7],
    meeting, closed: { id: closed.id, visibility: closed.visibility }, refusal: { event: closedEvent.status(), ics: closedFile.status() },
    parishView, firstAssignment, ics: file,
  }, null, 2))
  await testInfo.attach('phase-8-event-flow', { path: evidencePath, contentType: 'application/json' })
})

test('phase 8: ministry color is required, editable, neutral without a value, and names are short and masked together', async ({ page, openPhone }, testInfo) => {
  test.setTimeout(300_000)
  const ministry = 'Фаза 8 — цвет служения e2e'
  const member = { lastName: 'Скрытнова', firstName: 'Ольга', login: 'phase8-hidden@e2e.test', globalRole: 'Без справочника фазы 8 e2e' }
  const admin = { lastName: credentials.admin.lastName, firstName: credentials.admin.firstName }

  await loginAsAdmin(page)
  await createGlobalRole(page, member.globalRole, [])
  const memberPhone = await createInvitedAccount(page, openPhone, member)

  // Сценарий 10: без цвета форма не уходит на сервер.
  await openSection(page, 'Служения', 'Служения')
  let posts = 0
  const countPosts = (request: import('@playwright/test').Request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/ministries') posts++
  }
  page.on('request', countPosts)
  await page.getByRole('button', { name: 'Создать служение' }).click()
  await page.getByLabel('Название').fill(ministry)
  await page.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.getByTestId('ministry-color-error')).toHaveText('Выберите цвет')
  await expect(page.getByRole('radio', { name: 'Фиолетовый', exact: true })).toBeFocused()
  expect(posts).toBe(0)
  await page.getByRole('radio', { name: 'Бирюзовый', exact: true }).check()
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/ministries' && response.request().method() === 'POST')
  await Promise.all([expectApiResponse(page, 'GET', '/ministries', 200), page.getByRole('button', { name: 'Создать', exact: true }).click()])
  page.off('request', countPosts)
  expect((await created).status()).toBe(201)
  const createdMinistry = ((await (await created).json()) as { data: { id: string, color: string | null } }).data
  expect(createdMinistry.color).toBe('teal')
  expect(posts).toBe(1)
  const ministryPath = `/ministries/${createdMinistry.id}`
  await expect(page.getByRole('link', { name: ministry, exact: true })).toBeVisible()

  // Правка меняет цвет через меню «⋯» шапки служения.
  await Promise.all([expectApiResponse(page, 'GET', ministryPath, 200), page.getByRole('link', { name: ministry, exact: true }).click()])
  const tile = page.locator('.ministry-header').getByTestId('ministry-tile')
  await expect(tile).toHaveAttribute('style', /--ui-ministry-teal/)
  await expect(page.getByTestId('color-hint')).toHaveCount(0)
  await page.getByTestId('ministry-menu').click()
  await page.getByTestId('edit-color').click()
  const colorDialog = page.getByRole('dialog', { name: 'Цвет служения', exact: true })
  await expect(colorDialog.getByRole('radio', { name: 'Бирюзовый', exact: true })).toBeChecked()
  await colorDialog.getByRole('radio', { name: 'Розовый', exact: true }).check()
  const patched = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1${ministryPath}` && response.request().method() === 'PATCH')
  await colorDialog.getByTestId('save-color').click()
  expect((await patched).status()).toBe(200)
  expect(((await (await patched).json()) as { data: { color: string } }).data.color).toBe('rose')
  await expect(colorDialog).toBeHidden()
  await expect(tile).toHaveAttribute('style', /--ui-ministry-rose/)
  await reloadAuthenticated(page)
  await expect(tile).toHaveAttribute('style', /--ui-ministry-rose/)

  // Служение, созданное до колонки цвета, моделируется так же, как его оставила
  // миграция: прямой записью NULL в изолированной базе сквозных тестов.
  runArtisan(['tinker', '--execute', [
    'if (Illuminate\\Support\\Facades\\DB::connection()->getConfig("database") !== "church_e2e") {',
    'throw new RuntimeException("Refusing to change data outside the isolated E2E environment.");',
    '}',
    `Illuminate\\Support\\Facades\\DB::table("ministries")->where("id", "${createdMinistry.id}")->update(["color" => null]);`,
  ].join(' ')])
  await reloadAuthenticated(page)
  await expect(tile).toHaveAttribute('style', /--ui-ministry-church/)
  const hint = page.getByTestId('color-hint')
  await expect(hint).toBeVisible()
  await expect(hint.getByRole('button', { name: 'Выберите цвет служения', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('ministry-without-color-manager.png'), fullPage: true })

  // Участник без права правки видит нейтральный цвет и не видит подсказки.
  await openMinistryTab(page, 'Участники', ministry, [`${ministryPath}/members`, `${ministryPath}/roles`])
  await addMember(page, member.lastName, fullName(member))
  await expect(async () => {
    await visitAuthenticated(memberPhone, ministryPath)
    await expect(memberPhone.getByRole('heading', { level: 1, name: ministry, exact: true })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await expect(memberPhone.locator('.ministry-header').getByTestId('ministry-tile')).toHaveAttribute('style', /--ui-ministry-church/)
  await expect(memberPhone.getByTestId('color-hint')).toHaveCount(0)
  await expect(memberPhone.getByTestId('ministry-menu')).toHaveCount(0)

  // Управляющий выбирает цвет из подсказки, и она исчезает.
  await openMinistryTab(page, 'Обзор', ministry, [ministryPath])
  await hint.getByRole('button', { name: 'Выберите цвет служения', exact: true }).click()
  await colorDialog.getByRole('radio', { name: 'Зелёный', exact: true }).check()
  await Promise.all([expectApiResponse(page, 'PATCH', ministryPath, 200), colorDialog.getByTestId('save-color').click()])
  await expect(page.getByTestId('color-hint')).toHaveCount(0)
  await expect(tile).toHaveAttribute('style', /--ui-ministry-green/)

  // Сценарий 11: личный чат называется коротким именем собеседника.
  await openSection(page, 'Чаты', 'Чаты')
  await page.getByTestId('write').click()
  await page.getByTestId('write-direct').click()
  const direct = page.getByRole('dialog', { name: 'Новое сообщение', exact: true })
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/people' && new URL(response.url()).searchParams.get('search') === member.lastName),
    direct.getByRole('searchbox', { name: 'Найти человека', exact: true }).fill(member.lastName),
  ])
  // В выборе человека остаётся полное имя: оно различает однофамильцев.
  const opened = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/chats' && response.request().method() === 'POST')
  await direct.getByRole('button', { name: fullName(member), exact: true }).click()
  const openedChat = ((await (await opened).json()) as { data: { id: string, title: string } }).data
  expect(openedChat.title).toBe(shortName(member))
  await expect(page).toHaveURL(`/chats/${openedChat.id}`)
  const adminHeader = page.locator('.chat-screen').getByRole('heading', { level: 1 })
  await expect(adminHeader).toHaveText(shortName(member))
  await expect(page.getByTestId('composer')).toBeEnabled()
  await page.getByTestId('composer').fill('Добрый вечер! Сообщение администратора e2e')
  const sent = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/chats/${openedChat.id}/messages` && response.request().method() === 'POST')
  await page.getByTestId('send').click()
  expect((await sent).status()).toBe(201)
  const adminMessage = ((await (await sent).json()) as { data: ChatMessage }).data
  expect(adminMessage.sender!.person).toMatchObject({ full_name: fullName(admin), short_name: shortName(admin) })

  // Собеседник без справочника: имя администратора скрыто целиком — и полное, и короткое.
  const memberList = memberPhone.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/chats' && response.request().method() === 'GET')
  await visitAuthenticated(memberPhone, '/chats')
  const memberChats = ((await (await memberList).json()) as { data: ChatSummary[] }).data
  expect(memberChats.find(chat => chat.id === openedChat.id)?.title).toBe('Личный чат')
  const memberLink = memberPhone.locator(`a[href="/chats/${openedChat.id}"]`)
  await expect(memberLink.locator('.chat-item__title')).toHaveText('Личный чат')
  const history = memberPhone.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/chats/${openedChat.id}/messages` && response.request().method() === 'GET')
  await Promise.all([expectApiResponse(memberPhone, 'GET', `/chats/${openedChat.id}`, 200), memberLink.click()])
  const hidden = ((await (await history).json()) as { data: ChatMessage[] }).data.find(message => message.id === adminMessage.id)!
  expect(hidden.sender!.person).toMatchObject({ full_name: null, short_name: null, photo_thumb_url: null })
  await expect(memberPhone.locator('.chat-screen').getByRole('heading', { level: 1 })).toHaveText('Личный чат')
  await expect(memberPhone.locator(`[data-message-id="${adminMessage.id}"] .message-sender`)).toHaveText('Участник')
  for (const name of [shortName(admin), fullName(admin), admin.lastName]) await expect(memberPhone.getByText(name)).toHaveCount(0)
  await expect(memberPhone.getByTestId('composer')).toBeEnabled()
  await memberPhone.getByTestId('composer').fill('Спасибо, получила e2e')
  const replied = memberPhone.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/chats/${openedChat.id}/messages` && response.request().method() === 'POST')
  await memberPhone.getByTestId('send').click()
  expect((await replied).status()).toBe(201)
  const reply = ((await (await replied).json()) as { data: ChatMessage }).data
  await memberPhone.screenshot({ path: testInfo.outputPath('direct-hidden-name-member.png'), fullPage: true })

  // Администратор видит ответ под коротким именем собеседника, без отчества и фамилии первой.
  await reloadAuthenticated(page)
  await expect(page.locator(`[data-message-id="${reply.id}"] .message-sender`)).toHaveText(shortName(member))
  await expect(page.locator('.chat-screen').getByRole('heading', { level: 1 })).toHaveText(shortName(member))
  await page.screenshot({ path: testInfo.outputPath('direct-short-name-admin.png'), fullPage: true })

  const evidencePath = testInfo.outputPath('phase-8-ministry-names.json')
  await writeFile(evidencePath, JSON.stringify({ scenarios: [10, 11], createdMinistry, chat: openedChat, adminMessage, hidden, reply, memberChats }, null, 2))
  await testInfo.attach('phase-8-ministry-names', { path: evidencePath, contentType: 'application/json' })
})
