import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { installAcceptanceApi } from './support/acceptance-api'
import { checkDocumentWidth, settleLayout, takeAcceptanceScreenshot } from './support/acceptance-layout'

async function openEnlarged(page: Page, path: string) {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(path)
  await expect(page.locator('main h1')).toBeVisible()
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await settleLayout(page)
}

async function wholeWords(locator: Locator, maxLength = 30) {
  expect(await locator.count(), 'the reviewed content is present').toBeGreaterThan(0)
  const measurements = await locator.evaluateAll((elements, maximum) => elements.map((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const broken: string[] = []
    let node: Node | null
    while ((node = walker.nextNode())) for (const word of (node.textContent ?? '').matchAll(/\p{L}[\p{L}\p{M}]*/gu)) {
      if (word[0].length > maximum) continue // Legal long user names/titles still wrap.
      const range = document.createRange()
      range.setStart(node, word.index!)
      range.setEnd(node, word.index! + word[0].length)
      if (new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size > 1) broken.push(word[0])
    }
    return { text: element.textContent?.trim(), width: element.getBoundingClientRect().width, broken }
  }), maxLength)
  for (const item of measurements) expect.soft(item.broken, item.text).toEqual([])
  return measurements
}

async function evidence(page: Page, info: TestInfo, name: string, measurements: unknown) {
  await checkDocumentWidth(page)
  const path = info.outputPath(name + '.json')
  await writeFile(path, JSON.stringify(measurements, null, 2))
  await info.attach(name, { path, contentType: 'application/json' })
  await takeAcceptanceScreenshot(page, info, name)
}

test('an invitation heading keeps its complete UI word at 320px text 200%', async ({ page }, info) => {
  const api = await installAcceptanceApi(page, { guest: true })
  await openEnlarged(page, '/invite/acceptance-invite')
  await evidence(page, info, 'invitation', await wholeWords(page.getByRole('heading', { name: 'Приглашение', exact: true })))
  expect(api.unhandled).toEqual([])
})

test('list rows retain readable text beside images and unread badges', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  for (const [path, selector, maxWord] of [
    ['/', '.chat-item__content strong, .chat-item__preview', 12],
    ['/chats', '.chat-item__content strong, .chat-item__preview', 12],
    ['/ministries', '.ministries-page__item p', 12],
    ['/people', '.person-item strong', 10],
  ] as const) {
    await openEnlarged(page, path)
    await evidence(page, info, path === '/' ? 'home-list' : path.slice(1) + '-list', await wholeWords(page.locator(selector), maxWord))
  }
  expect(api.unhandled).toEqual([])
})

test('fixed labels and detail actions keep normal words at enlarged text', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  for (const [path, selector] of [
    ['/settings/notifications', '.notification-settings label'],
    ['/people', '.people-page__checkbox'],
    ['/people/p1', '.person-card h2, .person-card button'],
    ['/ministries/m1', '.ministry-card .ministry-tabs a, .ministry-card button'],
    ['/settings/ical', '.ical-settings > button'],
  ] as const) {
    await openEnlarged(page, path)
    await evidence(page, info, path.slice(1).replaceAll('/', '-'), await wholeWords(page.locator(selector)))
  }
  expect(api.unhandled).toEqual([])
})

test('event slot actions and ordinary card text remain readable without nested gutter loss', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  await openEnlarged(page, '/events/e1')
  await evidence(page, info, 'event-slots', await wholeWords(page.locator('.slot button, .event-card h1'), 12))
  await openEnlarged(page, '/calendar')
  await evidence(page, info, 'cancelled-event', await wholeWords(page.locator('.cancelled'), 12))
  expect(api.unhandled).toEqual([])
})

test('populated native event datetime controls retain editable dates and seconds', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  let sent: Record<string, unknown> | undefined
  api.respond('POST', '/events', (request) => { sent = request.postDataJSON(); return { status: 201, json: { data: api.data.event } } })
  await openEnlarged(page, '/events/new')
  await expect(page.locator('.datetime-readout')).toHaveCount(0)
  await page.locator('[data-test=title]').fill('Проверка выбранного времени')
  const measurements: unknown[] = []
  for (const [name, value] of [['starts-at', '2026-11-08T10:00:37'], ['ends-at', '2026-11-08T12:15:42']] as const) {
    const field = page.locator('[data-test=' + name + ']')
    await field.fill(value)
    await expect(field).toHaveValue(value)
    await field.focus()
    await page.keyboard.press('ArrowUp')
    await expect(field).not.toHaveValue(value)
    const edited = await field.inputValue()
    await field.fill(value)
    measurements.push({ name, value, edited, box: await field.boundingBox(), native: await field.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, font: getComputedStyle(element).fontSize })) })
    await field.screenshot({ path: info.outputPath(name + '-populated.png') })
  }
  await evidence(page, info, 'event-datetimes', measurements)
  await expect(page.getByText('08.11.2026, 10:00:37', { exact: true })).toBeVisible()
  await expect(page.getByText('08.11.2026, 12:15:42', { exact: true })).toBeVisible()
  const start = page.locator('[data-test=starts-at]')
  await start.fill('2026-11-09T10:00:37')
  await expect(page.getByText('09.11.2026, 10:00:37', { exact: true })).toBeVisible()
  await start.fill('2026-11-08T10:00:37')
  const descriptionId = await start.getAttribute('aria-describedby')
  expect(descriptionId).toBeTruthy()
  await expect(page.locator('[id="' + descriptionId + '"]')).toHaveText('08.11.2026, 10:00:37')
  await page.locator('button[type=submit]').click()
  await expect.poll(() => sent).toBeDefined()
  expect(sent).toEqual({ title: 'Проверка выбранного времени', description: null, location: null, visibility: 'church', media_ids: [],
    starts_at: '2026-11-08T07:00:37.000Z', ends_at: '2026-11-08T09:15:42.000Z', owner_type: 'church', slots: [], notify: 'none' })
  expect(api.unhandled).toEqual([])
})

test('detail controls keep visible spacing and image attachments keep list semantics', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  for (const width of [375, 1440, 320]) for (const path of ['/announcements/a1', '/events/e1', '/notifications', '/templates/t1']) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    if (width === 320) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await settleLayout(page)
    const controls = path === '/announcements/a1'
      ? page.locator('.announcement-page__actions button')
      : path === '/events/e1'
        ? page.locator('section[aria-label="Управление слотами"] li button')
        : path === '/notifications'
          ? page.locator('.notifications-page > a, .notifications-page [data-test=mark-all-read]')
          : page.locator('[data-test=edit-template], [data-test=toggle-active]')
    expect(await controls.count()).toBeGreaterThanOrEqual(2)
    const first = (await controls.nth(0).boundingBox())!, second = (await controls.nth(1).boundingBox())!
    if (second.y < first.y + first.height) expect(second.x).toBeGreaterThan(first.x + first.width)
    else expect(second.y).toBeGreaterThan(first.y + first.height)
    if (path === '/templates/t1') {
      const create = (await page.locator('[data-test=create-event]').boundingBox())!
      const archive = (await page.locator('[data-test=archive-template]').boundingBox())!
      if (archive.y < create.y + create.height) expect(archive.x).toBeGreaterThan(create.x + create.width)
      else expect(archive.y).toBeGreaterThan(create.y + create.height)
    }
    if (path === '/announcements/a1' || path === '/events/e1') {
      const attachments = page.getByRole('list', { name: 'Вложения', exact: true })
      await expect(attachments).toHaveCSS('list-style-type', 'none')
      await expect(attachments.getByRole('img')).toHaveCount(3)
    }
    await checkDocumentWidth(page)
    await takeAcceptanceScreenshot(page, info, path.slice(1).replaceAll('/', '-') + '-' + width)
  }
  expect(api.unhandled).toEqual([])
})

test('a phone person detail gives ordinary name words the available card width', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/people/p1')
  await expect(page.locator('.person-card h1')).toBeVisible()
  await settleLayout(page)
  await evidence(page, info, 'person-detail-375', await wholeWords(page.locator('.person-card h1'), 24))
  expect(api.unhandled).toEqual([])
})
