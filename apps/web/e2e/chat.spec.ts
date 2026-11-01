import type { Page, Request, Response } from '@playwright/test'
import { e2e } from './environment'
import { addMember, createGlobalRole, createInvitedAccount, createMinistry, expect, expectApiResponse, fullName, loginAsAdmin, openSection, test, visitAuthenticated } from './fixtures'

// Observe the real Reverb transport before opening the chat. No HTTP or Echo mocks.
function observeChat(page: Page) {
  const subscribed: string[] = []
  const frames: { event: string, channel: string, data: { message_id?: string } }[] = []
  const initialHttp = new Set<Request>()
  let lastHttpActivity = performance.now()
  const started = (request: Request) => {
    const url = new URL(request.url())
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname.startsWith('/app/')) return
    initialHttp.add(request); lastHttpActivity = performance.now()
  }
  const finished = (request: Request) => {
    if (initialHttp.delete(request)) lastHttpActivity = performance.now()
  }
  page.on('request', started)
  page.on('requestfinished', finished)
  page.on('requestfailed', finished)
  let navigations = 0
  let historyRequests = 0
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
  page.on('request', request => {
    if (/\/chats\/[^/]+\/messages$/.test(new URL(request.url()).pathname) && request.method() === 'GET') historyRequests++
  })
  page.on('websocket', socket => {
    expect(socket.url()).toContain(e2e.webOrigin.replace('http:', 'ws:') + '/app/')
    socket.on('framereceived', ({ payload }) => {
      const frame = JSON.parse(String(payload))
      if (frame.event === 'pusher_internal:subscription_succeeded') subscribed.push(frame.channel)
      if (frame.event.startsWith('message.')) frames.push({ ...frame, data: typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data })
    })
  })
  return {
    frames,
    snapshot: () => ({ navigations, historyRequests }),
    async ready(id: string) {
      try {
        await expect.poll(() => subscribed.includes(`private-chat.${id}`), { timeout: 20_000 }).toBe(true)
        // The SPA may already have reached an earlier document's networkidle.
        // Track current requests instead: catch-up/card/list work triggered by
        // this subscription must finish, then remain quiet for the usual 500ms.
        await expect.poll(() => initialHttp.size === 0 && performance.now() - lastHttpActivity >= 500, {
          message: 'initial chat HTTP requests completed and stayed quiet', timeout: 30_000,
        }).toBe(true)
      } finally {
        page.off('request', started)
        page.off('requestfinished', finished)
        page.off('requestfailed', finished)
      }
    },
    async delivered(id: string, messageId: string, event = 'message.sent') {
      await expect.poll(() => frames.some(frame => frame.channel === `private-chat.${id}` && frame.event === event && frame.data.message_id === messageId), { timeout: 20_000 }).toBe(true)
    },
  }
}

async function openChat(page: Page, title: string) {
  await visitAuthenticated(page, '/chats')
  const link = page.getByRole('link').filter({ has: page.locator('strong', { hasText: title }) })
  const path = (await link.getAttribute('href'))!
  // ChatScreen waits for both requests before enabling the composer.
  // Observe that HTTP lifecycle before applying the short UI assertion budget.
  await Promise.all([
    expectApiResponse(page, 'GET', path, 200),
    expectApiResponse(page, 'GET', `${path}/messages`, 200),
    link.click(),
  ])
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  await expect(page.getByTestId('composer')).toBeEnabled()
  return new URL(page.url()).pathname.split('/').at(-1)!
}

async function send(page: Page, chatId: string, body: string) {
  await page.getByTestId('composer').fill(body)
  const response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/chats/${chatId}/messages` && response.request().method() === 'POST')
  await page.getByTestId('send').click()
  const sent = await response
  expect(sent.status()).toBe(201)
  return ((await sent.json()) as { data: { id: string } }).data.id
}

test('a ministry photo message and reply arrive live through Reverb', async ({ page, openPhone }, testInfo) => {
  test.setTimeout(240_000)
  await loginAsAdmin(page)
  const role = 'Участник чата e2e'
  await createGlobalRole(page, role, ['Видеть справочник'])
  const first = { lastName: 'Чатнов', firstName: 'Сергей', login: 'chat-first@e2e.test', globalRole: role }
  const second = { lastName: 'Чатнова', firstName: 'Анна', login: 'chat-second@e2e.test', globalRole: role }
  const a = await createInvitedAccount(page, openPhone, first)
  const b = await createInvitedAccount(page, openPhone, second)
  const title = 'Репетиция — чат e2e'
  await createMinistry(page, title)
  await page.getByRole('link', { name: title, exact: true }).click()
  await page.getByRole('navigation', { name: 'Разделы служения' }).getByRole('link', { name: 'Участники' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Участники' })).toBeVisible()
  await addMember(page, first.lastName, fullName(first))
  await addMember(page, second.lastName, fullName(second))
  const liveA = observeChat(a), liveB = observeChat(b)
  const id = await openChat(a, title)
  expect(await openChat(b, title)).toBe(id)
  await liveA.ready(id)
  await liveB.ready(id)
  const beforeA = liveA.snapshot(), beforeB = liveB.snapshot()

  // Valid image bytes exercise upload + queued image processing. PHP's built-in
  // server cannot serve X-Accel-Redirect bodies: assert metadata/links, not pixels.
  const uploaded = a.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/media' && response.request().method() === 'POST')
  await a.getByTestId('file-input').setInputFiles({ name: 'rehearsal.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=', 'base64') })
  const upload = await uploaded
  expect(upload.status()).toBe(201)
  const media = ((await upload.json()) as { data: { id: string, status: string } }).data
  expect(media.status).toBe('processing')
  await expect(a.getByRole('list', { name: 'Выбранные вложения' })).toHaveText('rehearsal.png×', { timeout: 20_000 })
  await expect(a.getByTestId('send')).toBeEnabled()
  const messageId = await send(a, id, 'Фото с репетиции e2e')
  await liveB.delivered(id, messageId)
  const received = b.locator(`[data-message-id="${messageId}"]`)
  await expect(received).toContainText('Фото с репетиции e2e')
  await expect(received.locator('a')).toHaveAttribute('href', new RegExp(`/media/${media.id}\\?`))
  await expect(received.getByRole('img', { name: 'Вложение' })).toHaveAttribute('src', new RegExp(`/media/${media.id}`))
  const readReceipts = new Set<string>()
  const captureRead = (response: Response) => {
    const request = response.request()
    if (request.method() === 'POST' && new URL(response.url()).pathname === `/api/v1/chats/${id}/read` && response.status() === 200) {
      readReceipts.add((request.postDataJSON() as { message_id: string }).message_id)
    }
  }
  // Capture before sending so an already completed read response is not lost.
  // Its HTTP budget starts only after delivery and explicit viewing below.
  a.on('response', captureRead)
  try {
    const replyId = await send(b, id, 'Класс! e2e')
    await liveA.delivered(id, replyId)
    const reply = a.locator(`[data-message-id="${replyId}"]`)
    await expect(reply).toContainText('Класс! e2e')
    expect(liveA.snapshot()).toEqual(beforeA)
    expect(liveB.snapshot()).toEqual(beforeB)
    await a.bringToFront()
    await reply.scrollIntoViewIfNeeded()
    await expect.poll(() => readReceipts.has(replyId), { message: 'the latest reply has a successful read response', timeout: 15_000 }).toBe(true)
    await expect(a.getByTestId('chat-badge')).toHaveCount(0)
    await openSection(a, 'Чаты', 'Чаты')
    await expect(a.getByTestId(`unread-${id}`)).toHaveCount(0)
    await testInfo.attach('live-chat', { body: JSON.stringify({ id, media, messageId, replyId, readReceipts: [...readReceipts], framesA: liveA.frames, framesB: liveB.frames, beforeA, beforeB }, null, 2), contentType: 'application/json' })
  } finally {
    a.off('response', captureRead)
  }
})

test('a plain group member cannot delete another sender but the owner can moderate live', async ({ page, openPhone }, testInfo) => {
  test.setTimeout(180_000)
  await loginAsAdmin(page)
  const person = { lastName: 'Чатгость', firstName: 'Олег', login: 'chat-member@e2e.test', globalRole: 'Гость чата e2e' }
  await createGlobalRole(page, person.globalRole, ['Видеть справочник'])
  const member = await createInvitedAccount(page, openPhone, person)
  const live = observeChat(member)
  await openSection(page, 'Чаты', 'Чаты')
  await page.getByTestId('new-group').click()
  await page.getByTestId('title').fill('Модерация e2e')
  await page.getByTestId('search').fill(person.lastName)
  await page.getByTestId(/^option-/).filter({ hasText: fullName(person) }).click()
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/chats' && response.request().method() === 'POST')
  await page.getByTestId('create').click()
  expect((await created).status()).toBe(201)
  await expect(page.getByTestId('composer')).toBeEnabled()
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  await openChat(member, 'Модерация e2e')
  await live.ready(id)
  const adminMessage = await send(page, id, 'Сообщение владельца e2e')
  await live.delivered(id, adminMessage)
  await expect(member.locator(`[data-message-id="${adminMessage}"]`)).toContainText('Сообщение владельца e2e')
  await member.getByTestId(`actions-${adminMessage}`).click()
  await expect(member.getByTestId(`delete-${adminMessage}`)).toHaveCount(0)
  await member.keyboard.press('Escape')
  // UI absence plus the real authenticated endpoint prove the permission boundary.
  const denied = await member.request.delete(`/api/v1/messages/${adminMessage}`, { headers: { Origin: e2e.webOrigin, Referer: member.url(), 'X-XSRF-TOKEN': decodeURIComponent((await member.context().cookies()).find(cookie => cookie.name === 'XSRF-TOKEN')!.value) } })
  expect(denied.status()).toBe(403)
  const memberMessage = await send(member, id, 'Сообщение участника для модерации e2e')
  await expect(page.locator(`[data-message-id="${memberMessage}"]`)).toContainText('Сообщение участника для модерации e2e')
  await member.getByTestId(`actions-${memberMessage}`).click()
  await expect(member.getByTestId(`delete-${memberMessage}`)).toBeVisible()
  await member.keyboard.press('Escape')
  const before = live.snapshot()
  await page.getByTestId(`actions-${memberMessage}`).click()
  await page.getByTestId(`delete-${memberMessage}`).click()
  await Promise.all([expectApiResponse(page, 'DELETE', `/messages/${memberMessage}`, 204), page.getByRole('alertdialog', { name: 'Удалить сообщение?' }).getByRole('button', { name: 'Удалить', exact: true }).click()])
  await live.delivered(id, memberMessage, 'message.deleted')
  await expect(member.locator(`[data-message-id="${memberMessage}"]`)).toContainText('Сообщение удалено')
  await expect(member.locator(`[data-message-id="${adminMessage}"]`)).toContainText('Сообщение владельца e2e')
  expect(live.snapshot()).toEqual(before)
  await testInfo.attach('chat-moderation', { body: JSON.stringify({ id, denied: denied.status(), adminMessage, memberMessage, frames: live.frames }, null, 2), contentType: 'application/json' })
})
