import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAcceptanceApi } from './support/acceptance-api'
import { expectControlInViewport } from './support/acceptance-layout'

const editorScreenshots = resolve('../../.superpowers/sdd/phase-7/task-5-screenshots')
test.use({ timezoneId: 'America/Los_Angeles' })
for (const width of [390, 1440]) for (const theme of ['dark', 'light']) {
  test(`${theme} event editor has selected date and reachable actions at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page)
    let sent: Record<string, unknown> | undefined
    api.respond('POST', '/events', request => { sent = request.postDataJSON(); return { status: 201, json: { data: api.data.event } } })
    const context = '/calendar?date=2026-12-31&view=month&scope=mine'
    await page.goto('/events/new?date=2026-12-31&ministry=m1&return=' + encodeURIComponent(context))
    await expect(page.locator('[data-test=starts-date]')).toHaveValue('2026-12-31')
    await expect(page.locator('[data-test=ends-date]')).toHaveValue('2026-12-31')
    await expect(page.locator('[data-test=starts-time]')).toHaveValue('')
    await expect(page.locator('[data-test=owner]')).toHaveValue('m1')
    await page.locator('[data-test=title]').fill('Встреча в новом году')
    await page.locator('[data-test=location]').fill('Малый зал')
    await page.locator('[data-test=starts-time]').fill('23:00:23')
    await page.locator('[data-test=ends-date]').fill('2027-01-01')
    await page.locator('[data-test=ends-time]').fill('01:30:23')
    await expect(page.locator('[data-test=duration]')).toHaveText('Длительность: 2 ч 30 мин')
    await page.addStyleTag({ content: 'nuxt-devtools-frame { display:none!important }' })
    await mkdir(editorScreenshots, { recursive: true })
    await page.screenshot({ path: resolve(editorScreenshots, `editor-${width}-${theme}.png`), fullPage: true })
    const submit = page.getByRole('button', { name: 'Создать событие', exact: true }).last()
    await submit.scrollIntoViewIfNeeded(); await expect(submit).toBeInViewport()
    const bounds = (await submit.boundingBox())!
    const nav = width < 1024 ? await page.locator('.app-nav').boundingBox() : null
    if (nav) expect(bounds.y + bounds.height).toBeLessThanOrEqual(nav.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await submit.click()
    await expect(page).toHaveURL(/\/events\/e1\?return=/)
    expect(sent).toMatchObject({ owner_type: 'ministry', ministry_id: 'm1', starts_at: '2026-12-31T20:00:23.000Z', ends_at: '2026-12-31T22:30:23.000Z', notify: 'none' })
    expect(new URL(page.url()).searchParams.get('return')).toBe(context)
    await page.getByRole('link', { name: 'Календарь', exact: true }).last().click()
    await expect(page.locator('[data-test=calendar-date]')).toHaveValue('2026-12-31')
    await expect(page.locator('[data-test=scope-mine]')).toHaveAttribute('aria-pressed', 'true')
    expect(api.unhandled).toEqual([])
  })
}

test('editor field names remain stable when inline errors appear', async ({ page }) => {
  await installAcceptanceApi(page)
  await page.goto('/events/new?date=2026-11-08')
  await page.getByRole('button', { name: 'Добавить слот', exact: true }).click()
  await page.getByRole('button', { name: 'Создать событие', exact: true }).last().click()
  await expect(page.getByRole('textbox', { name: 'Название события', exact: true })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Подпись', exact: true })).toHaveAttribute('aria-invalid', 'true')
})

test('editor confirms route leave and preserves slot input when owner change is dismissed at 200% text', async ({ page }) => {
  const api = await installAcceptanceApi(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/events/new?date=2026-11-08&return=' + encodeURIComponent('/calendar?date=2026-11-08&view=list&scope=church'))
  await expect(page.locator('[data-test=starts-date]')).toHaveValue('2026-11-08')
  await page.addStyleTag({ content: 'html{font-size:200%!important} nuxt-devtools-frame{display:none!important}' })
  await page.locator('[data-test=title]').fill('Длинное название встречи с участниками служения')
  await page.locator('[data-test=starts-time]').fill('10:00:37')
  await page.locator('[data-test=ends-time]').fill('12:15:42')
  await page.locator('[data-test=add-slot]').click()
  await page.locator('[data-test=slot-0-label]').fill('Подготовка встречи')
  await page.locator('[data-test=owner]').selectOption('m1')
  await expect(page.getByRole('dialog', { name: 'Сменить владельца события?' })).toBeVisible()
  await page.locator('[data-test=keep-owner]').click()
  await expect(page.locator('[data-test=slot-0-label]')).toHaveValue('Подготовка встречи')
  await expect(page.locator('[data-test=owner]')).toHaveValue('church')
  await page.getByRole('link', { name: 'К календарю', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Выйти без сохранения?' })).toBeVisible()
  await page.locator('[data-test=keep-editing]').click()
  await expect(page).toHaveURL(/events\/new/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.locator('[data-test=starts-time]').evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 16))
  await page.screenshot({ path: resolve(editorScreenshots, 'editor-320-text-200-time.png') })
  await page.locator('[data-test=cancel-edit]').click()
  await page.screenshot({ path: resolve(editorScreenshots, 'editor-320-text-200-discard.png') })
  await page.locator('[data-test=discard-edit]').click()
  await expect(page).toHaveURL(/\/calendar\?date=2026-11-08/)
  expect(api.unhandled).toEqual([])
})

test('ministry inline creation takes selected date and safely cancels back to its calendar', async ({ page }) => {
  const api = await installAcceptanceApi(page)
  await page.goto('/ministries/m1/events?date=2026-12-31&view=month&scope=ministry%3Am1')
  await page.locator('[data-test=create-event]').click()
  await expect(page.getByRole('heading', { name: 'Новое событие', exact: true })).toBeVisible()
  await expect(page.locator('[data-test=title]')).toBeFocused()
  await expect(page.locator('[data-test=starts-date]')).toHaveValue('2026-12-31')
  await expect(page.locator('[data-test=owner]')).toHaveValue('m1')
  await page.locator('[data-test=cancel-edit]').click()
  await expect(page.locator('[data-test=calendar-date]')).toHaveValue('2026-12-31')
  expect(api.unhandled).toEqual([])
})

test('real attachment upload blocks both saves and a successful create is submitted once', async ({ page }) => {
  const api = await installAcceptanceApi(page)
  let finishUpload!: () => void, finishSave!: () => void, saves = 0
  api.respond('POST', '/media', async () => {
    await new Promise<void>(resolve => { finishUpload = resolve })
    return { status: 201, json: { data: { id: 'uploaded', status: 'ready', kind: 'file', url: '/uploaded.txt', thumb_url: null } } }
  })
  api.respond('POST', '/events', async request => {
    saves++
    expect(request.postDataJSON().media_ids).toEqual(['uploaded'])
    await new Promise<void>(resolve => { finishSave = resolve })
    return { status: 201, json: { data: api.data.event } }
  })
  await page.goto('/events/new?date=2026-11-08')
  await page.locator('[data-test=title]').fill('Встреча с вложением')
  await page.locator('[data-test=starts-time]').fill('10:00')
  await page.locator('[data-test=ends-time]').fill('12:00')
  await page.locator('[data-test=file-input]').setInputFiles({ name: 'план.txt', mimeType: 'text/plain', buffer: Buffer.from('План встречи') })
  await expect(page.getByText('Дождитесь загрузки вложений перед сохранением.')).toBeVisible()
  for (const button of await page.locator('button[type=submit]').all()) await expect(button).toBeDisabled()
  await page.locator('form.event-editor').evaluate(element => (element as HTMLFormElement).requestSubmit())
  expect(saves).toBe(0)
  finishUpload()
  await expect(page.locator('[data-test=save-event-top]')).toBeEnabled()
  await page.locator('[data-test=save-event-top]').click()
  await expect.poll(() => saves).toBe(1)
  await page.locator('form.event-editor').evaluate(element => (element as HTMLFormElement).requestSubmit())
  expect(saves).toBe(1)
  finishSave()
  await expect(page).toHaveURL(/\/events\/e1/)
  expect(api.unhandled).toEqual([])
})

const screenshots = resolve('../../.superpowers/sdd/phase-7/task-4-screenshots')
for (const width of [390, 1440]) for (const theme of ['dark', 'light']) {
  test(`${theme} calendar navigation and return context at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.clock.install({ time: new Date('2026-11-08T08:00:00Z') })
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page)
    await page.clock.setFixedTime(new Date('2026-11-08T08:00:00Z'))
    const requests: URL[] = []
    const items = Array.from({ length: 4 }, (_, i) => ({ ...api.data.event, id: `e${i + 1}`, title: i === 3 ? 'Отменённое событие с длинным названием для проверки читаемости' : ['Воскресное богослужение', 'Подготовка зала', 'Событие молодёжного служения'][i]!, status: i === 3 ? 'cancelled' : 'scheduled', cancel_reason: i === 3 ? 'Ремонт зала' : null }))
    api.respond('GET', '/events', request => {
      const url = new URL(request.url()); requests.push(url)
      const pageNo = Number(url.searchParams.get('page'))
      const list = url.searchParams.get('scope') === 'mine' ? items.slice(0, 1) : items
      return { json: { data: pageNo === 1 ? list.slice(0, 2) : list.slice(2), meta: { current_page: pageNo, last_page: 2, total: list.length } } }
    })
    api.respond('GET', '/events/e1', () => ({ json: { data: items[0] } }))
    await page.goto('/calendar?date=2026-11-08')
    await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
    await expect(page.locator('[data-test="selected-day"] .event-row a')).toHaveCount(4)
    if (width === 1440) {
      await expect(page.locator('.calendar-month')).toBeVisible()
      await page.locator('[data-test="overflow-2026-11-08"]').click()
      await expect(page.locator('[data-test="selected-day"]')).toBeFocused()
      expect(requests[0]!.searchParams.get('from')).toBe('2026-10-26')
      expect(requests[0]!.searchParams.get('to')).toBe('2026-12-06')
    } else { await expect(page.getByRole('button', { name: 'Месяц', exact: true })).toHaveAttribute('aria-pressed', 'false'); await expect(page.locator('[data-test="strip-day-2026-11-08"]')).toHaveAttribute('aria-pressed', 'true') }
    await page.addStyleTag({ content: 'nuxt-devtools-frame { display:none !important }' })
    await mkdir(screenshots, { recursive: true })
    await page.screenshot({ path: resolve(screenshots, `calendar-${width}-${theme}.png`), fullPage: true })
    await page.locator('[data-test="scope-mine"]').click()
    await expect(page.locator('[data-test="selected-day"] .event-row a')).toHaveCount(1)
    await page.locator('[data-test="selected-day"] .event-row a').first().click()
    await expect(page).toHaveURL(/\/events\/e1\?return=/)
    await page.getByRole('link', { name: 'Календарь', exact: true }).last().click()
    await expect(page.locator('[data-test="scope-mine"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-test="calendar-date"]')).toHaveValue('2026-11-08')
    await page.locator('[data-test="calendar-date"]').fill('2026-12-31')
    await page.getByRole('button', { name: 'Следующий месяц', exact: true }).click()
    await expect(page.locator('[data-test="calendar-date"]')).toHaveValue('2027-01-31')
    await page.locator('[data-test="calendar-today"]').click()
    await expect(page.locator('[data-test="calendar-date"]')).toHaveValue('2026-11-08')
    await page.getByRole('button', { name: 'Месяц', exact: true }).click()
    await expect(page.locator('.calendar-month')).toBeVisible()
    await page.locator('[data-test="day-2026-12-01"] .calendar-month__date').click()
    await expect(page.locator('[data-test="selected-day"]')).toBeFocused()
    await expect(page.locator('[data-test="calendar-date"]')).toHaveValue('2026-12-01')
    await page.locator('[data-test="previous-month"]').click()
    await expect(page.locator('[data-test="previous-month"]')).toBeFocused()
    await page.locator('[data-test="calendar-date"]').fill('2026-11-20')
    await expect(page.locator('[data-test="selected-day"]')).toContainText('На выбранный день доступных событий нет.')
    const create = page.getByRole('link', { name: 'Создать на 20 ноября', exact: true })
    expect(await create.getAttribute('href')).toContain('date=2026-11-20')
    expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('button', { name: 'Месяц', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Месяц', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    expect(api.unhandled).toEqual([])
  })
}

test('narrow explicit month keeps 44px dates and reflows at 200% text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await installAcceptanceApi(page)
  await page.goto('/calendar?date=2026-11-08&view=month&scope=church')
  await expect(page.locator('[data-test="selected-day"]')).toBeVisible()
  await page.addStyleTag({ content: 'html{font-size:32px!important} nuxt-devtools-frame{display:none!important}' })
  const date = page.locator('[data-test="day-2026-11-08"] .calendar-month__date')
  const bounds = (await date.boundingBox())!
  expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44)
  await date.focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-test="selected-day"]')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await mkdir(screenshots, { recursive: true })
  const time = await page.locator('.event-row__time').first().boundingBox(), text = await page.locator('.event-row__content').first().boundingBox()
  expect(time!.y + time!.height).toBeLessThanOrEqual(text!.y)
  await page.locator('.event-row__content').first().evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 16))
  await page.screenshot({ path: resolve(screenshots, 'calendar-320-text-200-viewport.png') })
  await page.locator('.event-row__content').first().screenshot({ path: resolve(screenshots, 'calendar-320-text-200.png') })
})

test('ministry calendar preserves its fixed scope and return context', async ({ page }) => {
  const api = await installAcceptanceApi(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/ministries/m1/events?date=2026-11-08&view=month&scope=ministry%3Am1')
  await expect(page.getByRole('heading', { name: 'События служения «Музыкальное служение»', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Область календаря', exact: true })).toHaveCount(0)
  await expect(page.locator('[data-test="selected-day"] .event-row a')).toHaveCount(2)
  const target = await page.locator('[data-test="selected-day"] .event-row a').first().getAttribute('href')
  expect(new URL(target!, 'https://church.test').searchParams.get('return')).toBe('/ministries/m1/events?date=2026-11-08&view=month&scope=ministry%3Am1')
  await page.screenshot({ path: resolve(screenshots, 'ministry-calendar-1440-dark.png'), fullPage: true })
  expect(api.unhandled).toEqual([])
})

const detailScreenshots = resolve('../../.superpowers/sdd/phase-7/task-6-screenshots')
for (const width of [390, 1440]) for (const theme of ['dark', 'light']) {
  test(`${theme} event detail has one roster and an explicit editor at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page)
    const context = '/calendar?date=2026-12-31&view=month&scope=mine'
    await page.goto('/events/e1?return=' + encodeURIComponent(context))
    await expect(page.locator('[data-test=my-participation]')).toContainText('Вы назначены')
    await expect(page.locator('.slot')).toHaveCount(1)
    await expect(page.locator('[data-test=edit-slot-s1]')).toHaveCount(1)
    await expect(page.locator('[data-test=slot-s1-count]')).toHaveText('1 из 3')
    expect(await page.locator('[data-test=calendar-return]').getAttribute('href')).toBe(context)
    const participation = (await page.locator('[data-test=my-participation]').boundingBox())!
    const information = (await page.getByRole('region', { name: 'О событии', exact: true }).boundingBox())!
    expect(participation.y + participation.height).toBeLessThan(information.y)
    await page.addStyleTag({ content: 'nuxt-devtools-frame{display:none!important}' })
    await mkdir(detailScreenshots, { recursive: true })
    await page.screenshot({ path: resolve(detailScreenshots, `detail-${width}-${theme}.png`), fullPage: true })
    await page.locator('[data-test=edit-event]').click()
    await expect(page.getByRole('heading', { name: 'Редактирование события', exact: true })).toBeVisible()
    await expect(page.locator('[data-test=title]')).toBeFocused()
    await expect(page.locator('.event-card')).toHaveCount(0)
    await page.locator('[data-test=title]').fill('Изменённое событие')
    await page.locator('[data-test=cancel-edit]').click()
    await expect(page.getByRole('dialog', { name: 'Выйти без сохранения?' })).toBeVisible()
    await page.locator('[data-test=keep-editing]').click()
    await expect(page.locator('[data-test=title]')).toHaveValue('Изменённое событие')
    await page.locator('[data-test=cancel-edit]').click()
    await page.locator('[data-test=discard-edit]').click()
    await expect(page.locator('[data-test=edit-event]')).toBeFocused()
    await page.locator('[data-test=edit-slot-s1]').click()
    await expect(page.getByRole('dialog', { name: 'Изменить слот', exact: true })).toBeVisible()
    await page.locator('[data-test=slot-0-count]').fill('4')
    await page.screenshot({ path: resolve(detailScreenshots, `slot-${width}-${theme}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-test=edit-slot-s1]')).toBeFocused()
    await page.locator('[data-test=cancel-event]').click()
    await expect(page.getByRole('dialog', { name: 'Отменить событие?' })).toBeVisible()
    await page.locator('[data-test=reason]').fill('Ремонт зала')
    await page.screenshot({ path: resolve(detailScreenshots, `cancel-${width}-${theme}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-test=cancel-event]')).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    expect(api.unhandled).toEqual([])
  })
}

test('saved slot stays saved when rereading fails and retry never repeats the write', async ({ page }) => {
  const api = await installAcceptanceApi(page)
  let writes = 0, failRead = false
  api.respond('PATCH', '/slots/s1', request => { writes++; api.data.event.slots[0]!.required_count = request.postDataJSON().required_count; failRead = true; return {} })
  api.respond('GET', '/events/e1', () => failRead ? { status: 503, json: { message: 'Нет связи с сервером.' } } : { json: { data: api.data.event } })
  await page.goto('/events/e1')
  await page.locator('[data-test=edit-slot-s1]').click()
  await page.locator('[data-test=slot-0-count]').fill('4')
  await page.locator('[data-test=save-slot]').click()
  await expect(page.getByRole('status').filter({ hasText: 'Изменение сохранено.' })).toBeVisible()
  await expect(page.locator('[data-test=save-slot]')).toHaveCount(0)
  await expect(page.locator('[data-test=edit-slot-s1]')).toBeDisabled()
  failRead = false
  await page.locator('[data-test=retry-assignments]').click()
  await expect(page.locator('[data-test=slot-s1-count]')).toHaveText('1 из 4')
  expect(writes).toBe(1)
  expect(api.unhandled).toEqual([])
})

for (const theme of ['dark', 'light']) test(`${theme} narrow detail with long identities and 200% text retains all slot actions`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
  const api = await installAcceptanceApi(page)
  api.data.event.title = 'Событие с очень длинным названием для всех участников служения'
  api.data.event.slots[0]!.label = 'ПодготовкаКСобытию'.repeat(5)
  api.data.event.slots[0]!.assignments.push({ id: 'hidden', person: { id: 'p-hidden', full_name: null, short_name: null, photo_thumb_url: null }, created_at: null })
  api.data.event.slots[0]!.filled_count = 4
  await page.goto('/events/e1')
  await expect(page.locator('[data-test=my-participation]')).toBeVisible()
  await page.addStyleTag({ content: 'html{font-size:200%!important} nuxt-devtools-frame{display:none!important}' })
  await expect(page.locator('.slot__state')).toContainText('Сверх нормы: 1')
  await expect(page.locator('.assignees')).toContainText('Имя скрыто')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await mkdir(detailScreenshots, { recursive: true })
  await page.screenshot({ path: resolve(detailScreenshots, `detail-320-text-200-${theme}.png`), fullPage: true })
  await page.locator('[data-test=remove-assignment-as1]').click()
  const dialog = page.getByRole('dialog', { name: 'Подтверждение снятия назначения' })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: resolve(detailScreenshots, `remove-320-text-200-${theme}.png`) })
  await page.locator('[data-test=cancel-remove-assignment]').click()
  await page.locator('[data-test=edit-slot-s1]').click()
  await page.locator('[data-test=save-slot]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-test=save-slot]')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: resolve(detailScreenshots, `slot-320-text-200-${theme}.png`) })
  expect(api.unhandled).toEqual([])
})

test('event detail distinguishes full, empty, hidden and cancelled states without management', async ({ page }) => {
  const api = await installAcceptanceApi(page)
  api.data.event.can_manage = false
  api.data.event.slots[0]!.can_fill = false
  api.data.event.slots[0]!.required_count = 1
  await page.goto('/events/e1')
  await expect(page.locator('.slot__state')).toContainText('Заполнен')
  await expect(page.locator('[data-test=edit-event], [data-test=assign-s1], [data-test=edit-slot-s1]')).toHaveCount(0)
  api.data.event.slots = []
  await page.reload()
  await expect(page.getByText('Слотов пока нет.', { exact: true })).toBeVisible()
  api.data.event.status = 'cancelled'; api.data.event.cancel_reason = 'Ремонт зала'
  await page.reload()
  await expect(page.locator('[data-test=cancelled-e1]')).toContainText('Ремонт зала')
  await expect(page.locator('[data-test=cancel-event]')).toHaveCount(0)
  await expect(page.locator('[data-test=calendar-return]')).toHaveAttribute('href', '/calendar')
  expect(api.unhandled).toEqual([])
})

test('saved detail restores focus while the follow-up GET is pending and calendar return has a 44px target', async ({ page }) => {
  const api = await installAcceptanceApi(page)
  let finishRead!: () => void
  api.respond('PATCH', '/events/e1', request => {
    api.data.event.title = request.postDataJSON().title
    api.respond('GET', '/events/e1', async () => { await new Promise<void>(resolve => { finishRead = resolve }); return { json: { data: api.data.event } } })
    return { json: { data: api.data.event } }
  })
  await page.goto('/events/e1')
  await page.locator('[data-test=edit-event]').click()
  await page.locator('[data-test=title]').fill('Сохранённое название события')
  await page.locator('[data-test=save-event-top]').click()
  await expect(page.getByRole('heading', { name: 'Сохранённое название события', exact: true })).toBeVisible()
  await expect(page.locator('[data-test=edit-event]')).toBeDisabled()
  await expect(page.locator('.event-card .page-header')).toBeFocused()
  finishRead()
  await expect(page.locator('[data-test=edit-event]')).toBeEnabled()
  expect((await page.locator('[data-test=calendar-return]').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(api.unhandled).toEqual([])
})

const candidateScreenshots = resolve('../../.superpowers/sdd/phase-7/task-7-screenshots')
for (const width of [390, 1440]) for (const theme of ['dark', 'light']) {
  test(`${theme} candidate preview search and confirmed warnings at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page)
    const person = { id: 'p2', full_name: 'Константинопольская Александра Сергеевна', short_name: 'Константинопольская Александра Сергеевна', photo_thumb_url: null }
    const conflicts = [{ event_id: 'visible', title: 'Репетиция музыкального служения', starts_at: '2026-11-08T08:00:00Z', ends_at: '2026-11-08T09:00:00Z' }, { event_id: null, title: 'Пересечение с недоступным событием', starts_at: null, ends_at: null }]
    const requests: string[] = []
    let writes = 0, failRead = false
    api.respond('GET', '/slots/s1/candidates', request => {
      const query = new URL(request.url()).searchParams.get('search') ?? ''; requests.push(query)
      return { json: { data: query ? [] : [
        { person: { id: 'p1', full_name: api.data.person.full_name, photo_thumb_url: api.data.person.photo_url }, has_role: false, conflicts: [] },
        { person, has_role: false, conflicts },
      ] } }
    })
    api.respond('POST', '/slots/s1/assignments', request => {
      writes++; expect(request.postDataJSON()).toEqual({ person_id: 'p2' }); failRead = true
      const assignment = { id: 'as2', person, created_at: null }
      api.data.event.slots[0]!.assignments.push(assignment); api.data.event.slots[0]!.filled_count++
      return { status: 201, json: { data: assignment, warnings: [{ code: 'time_conflict', message: 'Есть пересечение.', event_ids: ['visible'] }, { code: 'over_capacity', message: 'Сверх нормы.' }] } }
    })
    api.respond('GET', '/events/e1', () => failRead ? { status: 503, json: { message: 'Нет связи с сервером.' } } : { json: { data: api.data.event } })
    await page.goto('/events/e1')
    await page.locator('[data-test=assign-s1]').click()
    const dialog = page.getByRole('dialog', { name: 'Назначить: Помощь в подготовке зала', exact: true })
    await expect(dialog).toBeVisible()
    await expect(page.locator('[data-test=search]')).toBeFocused()
    await expect(page.locator('[data-test=candidate-p1]')).toBeDisabled()
    await expect(page.locator('[data-test=candidate-p2]')).toContainText('11:00')
    await expect(page.locator('[data-test=candidate-p2]')).toContainText('Пересечение с недоступным событием')
    expect(await dialog.locator('a').count()).toBe(0)
    await page.addStyleTag({ content: 'nuxt-devtools-frame{display:none!important}' })
    await mkdir(candidateScreenshots, { recursive: true })
    await page.screenshot({ path: resolve(candidateScreenshots, `preview-${width}-${theme}.png`) })
    await page.locator('[data-test=search]').fill('а')
    await expect(dialog).toContainText('Введите хотя бы два символа')
    await expect(dialog.locator('.candidates')).toHaveCount(0)
    expect(requests).toEqual([''])
    await page.locator('[data-test=search]').fill('никого')
    await expect(dialog).toContainText('Никого не найдено')
    await page.locator('[data-test=search]').fill('')
    await expect(page.locator('[data-test=candidate-p2]')).toBeVisible()
    expect(requests).toEqual(['', 'никого', ''])
    expect((await page.locator('[data-test=candidate-p2]').boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.locator('[data-test=candidate-p2]').click()
    await expect(dialog).toContainText('Назначение создано')
    await expect(page.locator('[data-test=warnings]')).toContainText('Репетиция музыкального служения')
    await expect(page.locator('[data-test=warnings]')).toContainText('Есть и другие пересечения')
    await expect(page.locator('[data-test=warnings]')).toContainText('сверх нормы')
    await expect(page.locator('[data-test=candidate-p2]')).toBeDisabled()
    await page.screenshot({ path: resolve(candidateScreenshots, `success-${width}-${theme}.png`) })
    failRead = false
    await page.locator('[data-test=close-assign]').click()
    await page.locator('[data-test=retry-assignments]').click()
    await expect(page.locator('[data-test=slot-s1-count]')).toHaveText('2 из 3')
    expect(writes).toBe(1)
    await page.locator('[data-test=assign-s1]').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-test=assign-s1]')).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    expect(api.unhandled).toEqual([])
  })
}
for (const theme of ['dark', 'light']) test(`${theme} narrow candidate preview at 200% keeps errors warnings and close reachable`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
  const api = await installAcceptanceApi(page)
  let fail = true
  const person = { id: 'p2', full_name: 'Константинопольская Александра Сергеевна', short_name: 'Константинопольская Александра Сергеевна', photo_thumb_url: null }
  api.respond('GET', '/slots/s1/candidates', () => fail ? { status: 503, json: { message: 'Нет связи с сервером.' } } : { json: { data: [{ person, has_role: false, conflicts: [{ event_id: null, title: 'Пересечение с недоступным событием', starts_at: null, ends_at: null }] }] } })
  api.respond('POST', '/slots/s1/assignments', () => ({ status: 201, json: { data: { id: 'as2', person, created_at: null }, warnings: [{ code: 'time_conflict', message: 'Есть пересечение.', event_ids: [] }] } }))
  await page.goto('/events/e1')
  await page.addStyleTag({ content: 'html{font-size:200%!important} nuxt-devtools-frame{display:none!important}' })
  await page.locator('[data-test=assign-s1]').click()
  const dialog = page.getByRole('dialog', { name: 'Назначить: Помощь в подготовке зала', exact: true })
  await expect(dialog.getByRole('alert')).toBeVisible()
  fail = false
  await dialog.getByRole('button', { name: 'Повторить' }).click()
  await expect(page.locator('[data-test=candidate-p2]')).toBeVisible()
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await mkdir(candidateScreenshots, { recursive: true })
  await dialog.evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: resolve(candidateScreenshots, `preview-320-text-200-${theme}.png`) })
  await page.locator('[data-test=candidate-p2]').click()
  await expect(page.locator('[data-test=warnings]')).toContainText('пересечение')
  const close = page.locator('[data-test=close-assign]')
  await close.scrollIntoViewIfNeeded(); await expect(close).toBeInViewport()
  await page.screenshot({ path: resolve(candidateScreenshots, `success-320-text-200-${theme}.png`) })
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await close.focus(); await page.keyboard.press('Tab')
  await expect(page.locator('[data-test=search]')).toBeFocused()
  await page.keyboard.press('Shift+Tab'); await expect(close).toBeFocused()
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible()
  await expect(page.locator('[data-test=assign-s1]')).toBeFocused()
  expect(api.unhandled).toEqual([])
})

test('candidate dialog blocks a second write after failed roster read and recovers through reading', async ({ page }) => {
  const api = await installAcceptanceApi(page)
  const person = { id: 'p2', full_name: 'Мария Орлова', short_name: 'Мария Орлова', photo_thumb_url: null }
  const other = { id: 'p3', full_name: 'Михаил Орлов', short_name: 'Михаил Орлов', photo_thumb_url: null }
  let failRead = false, writes = 0
  api.respond('GET', '/slots/s1/candidates', () => ({ json: { data: [person, other].map(person => ({ person, has_role: false, conflicts: [] })) } }))
  api.respond('POST', '/slots/s1/assignments', () => {
    writes++; failRead = true
    const assignment = { id: 'as2', person, created_at: null }
    api.data.event.slots[0]!.assignments.push(assignment); api.data.event.slots[0]!.filled_count++
    return { status: 201, json: { data: assignment, warnings: [{ code: 'over_capacity', message: 'Сверх нормы.' }] } }
  })
  api.respond('GET', '/events/e1', () => failRead ? { status: 503, json: { message: 'Нет связи с сервером.' } } : { json: { data: api.data.event } })
  await page.goto('/events/e1')
  await page.locator('[data-test=assign-s1]').click()
  await expect(page.locator('[data-test=candidate-p3]')).toBeEnabled()
  await page.locator('[data-test=candidate-p2]').click()
  await expect(page.getByRole('dialog')).toContainText('Назначение создано')
  await expect(page.locator('[data-test=warnings]')).toContainText('сверх нормы')
  await expect(page.locator('[data-test=candidate-p3]')).toBeDisabled()
  await expect(page.getByRole('dialog')).toContainText('Закройте окно')
  await page.locator('[data-test=close-assign]').click()
  failRead = false
  await page.locator('[data-test=retry-assignments]').click()
  await expect(page.locator('[data-test=slot-s1-count]')).toHaveText('2 из 3')
  await page.locator('[data-test=assign-s1]').click()
  await expect(page.locator('[data-test=candidate-p3]')).toBeEnabled()
  await expect(page.locator('[data-test=candidate-p2]')).toBeDisabled()
  expect(writes).toBe(1)
  expect(api.unhandled).toEqual([])
})

const templateScreenshots = resolve('../../.superpowers/sdd/phase-7/task-8-screenshots')
for (const width of [390, 1440]) for (const theme of ['dark', 'light']) {
  test(`${theme} templates list detail and editor share calendar design at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page)
    api.data.template.recurrence = { type: 'monthly_nth_weekday', weekday: 7, nth: 5 }
    api.data.template.active = false
    api.respond('GET', '/calendar/slot-choices', () => ({ status: 200, json: { data: [{ id: 'm1', name: 'Служение гостеприимства', roles: [{ id: 'r1', name: 'Координатор служения гостеприимства' }] }] } }))
    api.data.template.slots = [{ id: 'ts1', label: 'Подготовка встречи и помощь участникам', role: { id: 'r1', name: 'Координатор служения гостеприимства', ministry_id: 'm1' }, required_count: 3, sort_order: 0 }]
    await mkdir(templateScreenshots, { recursive: true })
    const context = '/calendar?date=2026-12-31&view=month&scope=mine'
    await page.goto('/templates?date=2026-12-31&return=' + encodeURIComponent(context))
    await expect(page.getByRole('heading', { name: 'Шаблоны', exact: true })).toBeVisible()
    const axis = await page.locator('.templates-page').evaluate(el => {
      const selectors = ['h1', '.templates-filters', '.template-list']
      return selectors.map(selector => el.querySelector(selector)!.getBoundingClientRect().left)
    })
    expect(Math.max(...axis) - Math.min(...axis)).toBeLessThan(1)
    await expect(page.locator('.template-row')).toContainText('Пятое воскресенье месяца')
    await expect(page.locator('.template-state')).toHaveText('Неактивен')
    await page.addStyleTag({ content: 'nuxt-devtools-frame { display:none!important }' })
    await page.screenshot({ path: resolve(templateScreenshots, `list-${width}-${theme}.png`), fullPage: true })
    await page.getByRole('link', { name: api.data.template.title, exact: true }).click()
    await expect(page.locator('[data-test=event-date]')).toHaveValue('2026-12-31')
    await expect(page.getByText('Месяцы без пятого выбранного дня пропускаются.', { exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(templateScreenshots, `detail-${width}-${theme}.png`), fullPage: true })
    await page.locator('[data-test=edit-template]').click()
    await expect(page.getByRole('heading', { name: 'Редактирование шаблона', exact: true })).toBeFocused()
    await expect(page.locator('[data-test=owner]')).toHaveCount(0)
    await expect(page.locator('[data-test=nth]')).toHaveValue('5')
    await page.locator('[data-test=nth]').selectOption('-1')
    await expect(page.locator('[data-test=recurrence-summary]')).toHaveText('Последнее воскресенье месяца')
    await page.locator('[data-test=type]').selectOption('biweekly')
    await page.locator('[data-test=anchor]').fill('2026-11-07')
    await expect(page.getByText('События могут быть и раньше опорной даты.', { exact: false })).toBeVisible()
    if (width === 1440) {
      const about = await page.getByRole('region', { name: 'О шаблоне', exact: true }).boundingBox()
      const visibility = await page.getByRole('region', { name: 'Видимость и создание', exact: true }).boundingBox()
      const time = await page.getByRole('region', { name: 'Время и повторение', exact: true }).boundingBox()
      const slots = await page.getByRole('region', { name: 'Слоты', exact: true }).boundingBox()
      expect(slots!.x).toBeCloseTo(about!.x, 0)
      expect(slots!.width).toBeGreaterThan(about!.width * 1.8)
      expect(visibility!.x).toBeCloseTo(about!.x, 0)
      expect(visibility!.y).toBeGreaterThan(about!.y + about!.height)
      expect(time!.y).toBeCloseTo(about!.y, 0)
      const ministry = await page.getByRole('combobox', { name: 'Служение', exact: true }).boundingBox()
      const role = await page.getByRole('combobox', { name: 'Роль', exact: true }).boundingBox()
      expect(role!.y).toBeCloseTo(ministry!.y, 0)
      expect(role!.x).toBeGreaterThan(ministry!.x)
    }
    await page.screenshot({ path: resolve(templateScreenshots, `editor-${width}-${theme}.png`), fullPage: true })
    let payload: Record<string, unknown> | undefined
    api.respond('PATCH', '/templates/t1', request => { payload = request.postDataJSON(); return { status: 200, json: { data: api.data.template } } })
    await page.getByRole('button', { name: 'Сохранить', exact: true }).last().click()
    await expect(page.getByRole('heading', { name: api.data.template.title, exact: true })).toBeFocused()
    expect(payload?.recurrence).toEqual({ type: 'biweekly', weekday: 7, anchor_date: '2026-11-07' })
    expect(payload).not.toHaveProperty('slots')
    expect(payload).not.toHaveProperty('owner_type')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
for (const theme of ['dark', 'light']) test(`${theme} narrow template creation preserves owner slots errors and 200% text`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
  const api = await installAcceptanceApi(page)
  api.data.template.archived = true; api.data.template.active = false
  await page.goto('/templates/t1')
  await expect(page.getByText('Архив — только чтение', { exact: true })).toBeVisible()
  await expect(page.locator('[data-test=create-event]')).toHaveCount(0)
  await mkdir(templateScreenshots, { recursive: true })
  await page.screenshot({ path: resolve(templateScreenshots, `archived-320-${theme}.png`), fullPage: true })
  await page.goto('/templates')
  await page.getByRole('button', { name: 'Создать шаблон', exact: true }).click()
  await page.addStyleTag({ content: 'html { font-size:200%!important } nuxt-devtools-frame { display:none!important }' })
  await page.locator('[data-test=title]').fill('Шаблон встречи служения гостеприимства')
  await page.locator('[data-test=type]').selectOption('biweekly')
  await page.locator('[data-test=anchor]').fill('2026-11-07')
  await page.locator('[data-test=add-slot]').click()
  await page.locator('[data-test=slot-0-label]').fill('Дежурный с длинной подписью для встречи')
  await page.locator('[data-test=owner]').selectOption('m1')
  await page.locator('[data-test=keep-owner]').click()
  await expect(page.locator('[data-test=owner]')).toHaveValue('church')
  await expect(page.locator('[data-test=slot-0-label]')).toHaveValue('Дежурный с длинной подписью для встречи')
  api.respond('POST', '/templates', () => ({ status: 422, json: { message: 'Проверьте данные.', errors: { title: ['Проверьте название шаблона.'] } } }))
  await page.getByRole('button', { name: 'Сохранить', exact: true }).last().click()
  await expect(page.locator('[data-test=title]')).toBeFocused()
  await expect(page.locator('[data-test=title]')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('[data-test=anchor]')).toHaveValue('2026-11-07')
  // The automatic invalid-field focus above must succeed before any explicit
  // scrolling/focus. Flow navigation has no fixed overlay boundary.
  await expectControlInViewport(page, page.locator('[data-test=title]'))
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await mkdir(templateScreenshots, { recursive: true })
  await page.screenshot({ path: resolve(templateScreenshots, `narrow-errors-320-${theme}-200.png`), fullPage: true })
  await page.screenshot({ path: resolve(templateScreenshots, `narrow-error-viewport-320-${theme}-200.png`) })
  const save = page.getByRole('button', { name: 'Сохранить', exact: true }).last()
  await save.focus()
  await expect(save).toBeFocused()
  await save.evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expectControlInViewport(page, save)
  await page.screenshot({ path: resolve(templateScreenshots, `narrow-actions-viewport-320-${theme}-200.png`) })
})

test('template confirmations survive failed destination reads and archive errors stay in their dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  const api = await installAcceptanceApi(page)
  let templatePosts = 0, eventPosts = 0
  api.respond('POST', '/templates', () => { templatePosts++; return { status: 201, json: { data: api.data.template } } })
  api.respond('GET', '/templates/t1', () => ({ status: 503, json: {} }))
  await page.goto('/templates')
  await page.locator('[data-test=new-template]').click()
  await page.getByRole('textbox', { name: 'Название шаблона', exact: true }).fill('Независимые события')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).last().click()
  await expect(page).toHaveURL(/\/templates\/t1$/)
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить шаблон')
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить шаблон')
  expect(templatePosts).toBe(1)
  api.respond('GET', '/templates/t1', () => ({ status: 200, json: { data: api.data.template } }))
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  api.respond('POST', '/templates/t1/archive', () => ({ status: 422, json: { message: 'Шаблон недоступен для архивации.' } }))
  await page.locator('[data-test=archive-template]').click()
  await page.locator('[data-test=confirm-archive]').click()
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Шаблон недоступен для архивации.')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-test=archive-template]')).toBeFocused()
  api.respond('POST', '/templates/t1/create-event', () => { eventPosts++; return { status: 201, json: { data: { id: 'e1' } } } })
  api.respond('GET', '/events/e1', () => ({ status: 503, json: {} }))
  await page.locator('[data-test=event-date]').fill('2026-12-31')
  await page.locator('[data-test=create-event]').click()
  await expect(page).toHaveURL(/\/events\/e1$/)
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить событие')
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить событие')
  expect(eventPosts).toBe(1)
})

// Задача 8 фазы 8: месяц на компьютере: до трёх событий, цвета служений, «Вы», отменённые, одна строка управления.
const monthScreenshots = resolve('../../.superpowers/sdd/phase-8/task-8-screenshots')
for (const width of [1024, 1440]) for (const theme of ['dark', 'light']) for (const bigText of [false, true]) {
  test(`${theme} month shows three readable events and one toolbar line at ${width}${bigText ? ' with 200% text' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page)
    const base = api.data.event, ministry = (id: string, name: string, color: string | null) => ({ id, name, color })
    const items = [
      { ...base, id: 'd1', title: 'Воскресное богослужение с причастием', starts_at: '2026-11-10T07:00:00Z', ends_at: '2026-11-10T09:00:00Z' },
      { ...base, id: 'd2', title: 'Репетиция хора перед служением', owner_type: 'ministry' as const, ministry: ministry('m1', 'Музыкальное служение', 'violet'), slots: [], starts_at: '2026-11-10T09:00:00Z', ends_at: '2026-11-10T10:00:00Z' },
      { ...base, id: 'd3', title: 'Отменённая встреча молодёжи', owner_type: 'ministry' as const, ministry: ministry('m2', 'Молодёжь', 'amber'), slots: [], status: 'cancelled' as const, starts_at: '2026-11-10T11:00:00Z', ends_at: '2026-11-10T12:00:00Z' },
      { ...base, id: 'd4', title: 'Четвёртое событие дня', ministry: ministry('m3', 'Без цвета', null), slots: [], starts_at: '2026-11-10T13:00:00Z', ends_at: '2026-11-10T14:00:00Z' },
    ]
    api.respond('GET', '/events', () => ({ json: { data: items, meta: { current_page: 1, last_page: 1, total: items.length } } }))
    await page.goto('/calendar?date=2026-11-10&view=month&scope=church')
    await expect(page.locator('.calendar-month')).toBeVisible()
    await page.addStyleTag({ content: 'nuxt-devtools-frame { display:none !important }' + (bigText ? ' html{font-size:32px!important}' : '') })
    const cell = page.locator('[data-test="day-2026-11-10"]')
    await expect(cell.locator('.calendar-month__event')).toHaveCount(3)
    await expect(cell.locator('[data-test="overflow-2026-11-10"]')).toHaveText('Ещё 1')
    await expect(cell.locator('.calendar-month__event').first()).toContainText('Вы')
    await expect(cell.locator('.calendar-month__event.is-cancelled')).toHaveCSS('text-decoration-line', /none/)
    await expect(cell.locator('.calendar-month__event.is-cancelled .calendar-month__text')).toHaveCSS('text-decoration-line', 'line-through')
    await expect(page.locator('.calendar-zone')).toContainText('Europe/Moscow')
    const legend = page.locator('[data-test="calendar-legend"]')
    await expect(legend).toContainText('Церковь'); await expect(legend).toContainText('Музыкальное служение'); await expect(legend).toContainText('Вы — вы назначены')
    const cellBox = (await cell.boundingBox())!
    for (const chip of await cell.locator('.calendar-month__event').all()) {
      const box = (await chip.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x).toBeGreaterThanOrEqual(cellBox.x); expect(box.x + box.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 1)
    }
    if (!bigText && width === 1440) {
      const controls = await page.locator('.calendar-toolbar > *').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return [r.top, r.bottom] }))
      const top = Math.min(...controls.map(c => c[0]!)), bottom = Math.max(...controls.map(c => c[1]!))
      expect(bottom - top).toBeLessThan(70)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await mkdir(monthScreenshots, { recursive: true })
    await page.screenshot({ path: resolve(monthScreenshots, `month-${width}-${theme}${bigText ? '-text-200' : ''}.png`), fullPage: true })
    expect(api.unhandled).toEqual([])
  })
}

test('hidden date field still accepts fill (used by e2e), is hidden from screen readers; create sits last in the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const api = await installAcceptanceApi(page)
  await page.goto('/calendar?date=2026-11-10&view=month&scope=church')
  await expect(page.locator('.calendar-month')).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.locator('[data-test="calendar-date"]').fill('2026-12-31')
  await expect(page.locator('[data-test="calendar-date"]')).toHaveValue('2026-12-31')
  await expect(page.locator('[data-test="selected-day"]')).toContainText('31 декабря')
  const create = page.getByRole('link', { name: 'Создать событие', exact: true })
  await expect(create).toHaveCount(1); await expect(create).toContainText('Событие')
  expect(new URL((await create.getAttribute('href'))!, 'https://church.test').searchParams.get('date')).toBe('2026-12-31')
  expect(await page.locator('.calendar-toolbar > *').last().evaluate(node => node.matches('[data-test="toolbar-create"]'))).toBe(true)
  expect(api.unhandled).toEqual([])
})

const phoneScreenshots = resolve('../../.superpowers/sdd/phase-8/task-9-screenshots')
async function phoneCalendar(page: import('@playwright/test').Page, theme: string) {
  await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
  const api = await installAcceptanceApi(page)
  await page.clock.setFixedTime(new Date('2026-11-10T08:00:00Z'))
  const at = (id: string, title: string, start: string, over: Record<string, unknown> = {}) => ({ ...api.data.event, id, title, starts_at: start, ends_at: start.replace(/T(\d\d)/, (_, h) => `T${String(Number(h) + 1).padStart(2, '0')}`), ...over })
  const choir = { id: 'm1', name: api.data.ministry.name, color: 'teal' }
  const items = [
    at('p1', 'Репетиция хора', '2026-11-03T16:00:00Z', { owner_type: 'ministry', ministry: choir, slots: [] }),
    at('t1', 'Воскресное событие и совместный обед', '2026-11-10T07:00:00Z'),
    at('t2', 'Отменённая встреча молодёжи с длинным названием', '2026-11-10T10:00:00Z', { status: 'cancelled', cancel_reason: 'Ремонт зала', slots: [] }),
    at('f1', 'Служение для детей', '2026-11-12T07:00:00Z', { owner_type: 'ministry', ministry: choir, slots: [] }),
    at('f2', 'Домашняя группа', '2026-11-14T15:00:00Z', { slots: [] }),
  ]
  api.respond('GET', '/events', () => ({ json: { data: items, meta: { current_page: 1, last_page: 1, total: items.length } } }))
  api.respond('GET', '/events/t1', () => ({ json: { data: items[1] } }))
  return api
}
for (const theme of ['dark', 'light']) {
  test(`${theme} phone calendar keeps the strip and chips above a list that starts today at 390`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const api = await phoneCalendar(page, theme)
    await page.goto('/calendar')
    await expect(page.locator('.event-row').first()).toBeVisible()
    await expect(page.locator('.event-list h2').first()).toContainText('Сегодня')
    await expect(page.locator('[data-test="calendar-legend"]')).toHaveCount(0)
    const link = page.getByRole('link', { name: 'Создать событие', exact: true })
    await expect(link).toHaveCount(1)
    expect((await link.boundingBox())!.width).toBeGreaterThanOrEqual(44)
    // До первого события: заголовок страницы, одна шапка, одна лента, один ряд чипов.
    const strip = (await page.locator('.week-strip').boundingBox())!, chips = (await page.locator('[data-test=phone-chips]').boundingBox())!
    const first = (await page.locator('.event-list h2').first().boundingBox())!
    expect(strip.height).toBeLessThanOrEqual(72); expect(chips.height).toBeLessThanOrEqual(56)
    const head = (await page.locator('.phone-head').boundingBox())!
    expect(head.height).toBeLessThanOrEqual(56)
    // Между рядом чипов и первым днём — только подсказка пояса и кнопка «Показать прошедшие».
    expect(first.y).toBeLessThanOrEqual(chips.y + chips.height + 130)
    expect(first.y).toBeLessThan(420)
    const tops = await page.locator('[data-test=phone-chips] > *').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return r.top + r.height / 2 }))
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2)
    for (const day of await page.locator('[data-test^="strip-day-"]').all()) expect((await day.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('button', { name: 'Вторник, 10 ноября, событий: 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
    for (const row of await page.locator('.event-row').all()) {
      const box = (await row.boundingBox())!, anchor = (await row.locator('a').boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(56); expect(anchor.height).toBeGreaterThanOrEqual(44)
      expect(await row.locator('a').count()).toBe(1)
    }
    await expect(page.locator('.event-row.is-cancelled')).toContainText('Отменено')
    await expect(page.locator('.event-row__mine')).toHaveText('Вы')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await mkdir(phoneScreenshots, { recursive: true })
    await page.addStyleTag({ content: 'nuxt-devtools-frame { display:none !important }' })
    await page.screenshot({ path: resolve(phoneScreenshots, `phone-390-${theme}.png`), fullPage: true })
    // Прошедшие дни открываются выше; сегодняшний день остаётся на месте.
    const today = page.locator('[data-day="2026-11-10"] h2')
    const before = (await today.boundingBox())!.y
    await page.getByRole('button', { name: 'Показать прошедшие', exact: true }).click()
    await expect(page.locator('[data-day="2026-11-03"]')).toBeVisible()
    expect(Math.abs((await today.boundingBox())!.y - before)).toBeLessThanOrEqual(2)
    // Выбор дня в ленте: адрес хранит дату, вид и область; заголовок дня виден.
    await page.locator('[data-test="strip-day-2026-11-12"]').click()
    await expect(page).toHaveURL(/date=2026-11-12&view=list&scope=church/)
    await expect(page.locator('[data-test="selected-day"]')).toBeFocused()
    await expect(page.locator('[data-test="selected-day"] h2')).toBeInViewport()
    // Возврат из события сохраняет контекст.
    await page.locator('[data-day="2026-11-10"] .event-row a').first().click()
    await expect(page).toHaveURL(/\/events\/t1\?return=/)
    await page.getByRole('link', { name: 'Календарь', exact: true }).last().click()
    await expect(page).toHaveURL(/date=2026-11-12&view=list&scope=church/)
    await expect(page.locator('[data-test="strip-day-2026-11-12"]')).toHaveAttribute('aria-pressed', 'true')
    expect(api.unhandled).toEqual([])
  })
  test(`${theme} phone calendar at 320 with 200% text keeps the page from scrolling sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    const api = await phoneCalendar(page, theme)
    await page.goto('/calendar')
    await expect(page.locator('.event-row').first()).toBeVisible()
    await page.addStyleTag({ content: 'html{font-size:32px!important} nuxt-devtools-frame{display:none!important}' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    for (const day of await page.locator('[data-test^="strip-day-"]').all()) { const box = (await day.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(321) }
    for (const row of await page.locator('.event-row').all()) { expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(56); await expect(row.locator('a')).toHaveCount(1) }
    for (const control of ['[data-test=strip-previous]', '[data-test=strip-next]', '[data-test=phone-view-switch]', '[data-test=calendar-today]', '[data-test=previous-month]']) {
      const box = (await page.locator(control).boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x + box.width).toBeLessThanOrEqual(321); expect(box.x).toBeGreaterThanOrEqual(-1)
    }
    await mkdir(phoneScreenshots, { recursive: true })
    await page.screenshot({ path: resolve(phoneScreenshots, `phone-320-text-200-${theme}.png`), fullPage: true })
    expect(api.unhandled).toEqual([])
  })
}
