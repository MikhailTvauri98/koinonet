import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAcceptanceApi } from './support/acceptance-api'

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
    } else await expect(page.getByRole('button', { name: 'Список', exact: true })).toHaveAttribute('aria-pressed', 'true')
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
  api.data.event.slots[0]!.assignments.push({ id: 'hidden', person: { id: 'p-hidden', full_name: null, photo_thumb_url: null }, created_at: null })
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
    const person = { id: 'p2', full_name: 'Константинопольская Александра Сергеевна', photo_thumb_url: null }
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
  const person = { id: 'p2', full_name: 'Константинопольская Александра Сергеевна', photo_thumb_url: null }
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
  const person = { id: 'p2', full_name: 'Мария Орлова', photo_thumb_url: null }
  const other = { id: 'p3', full_name: 'Михаил Орлов', photo_thumb_url: null }
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
