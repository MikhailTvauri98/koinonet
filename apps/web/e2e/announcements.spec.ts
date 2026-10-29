import type { Page } from '@playwright/test'
import { e2e } from './environment'
import { addMember, createGlobalRole, createInvitedAccount, createMinistry, expect, expectApiResponse, fullName, loginAsAdmin, openSection, test } from './fixtures'

const reader = { lastName: 'Вестникова', firstName: 'Анна', login: 'announcement-reader@e2e.test', globalRole: 'Читатель объявлений e2e' }
const member = { lastName: 'Вестников', firstName: 'Иван', login: 'announcement-member@e2e.test', globalRole: 'Участник объявлений e2e' }
const stranger = { lastName: 'Посторонний', firstName: 'Олег', login: 'announcement-stranger@e2e.test', globalRole: 'Посетитель объявлений e2e' }

// Observe real browser frames, without replacing Echo, HTTP or the queue.
function observeNotifications(page: Page) {
  const subscriptions: string[] = []
  const notifications: { channel: string, data: { id: string, type: string, title: string, url: string } }[] = []
  const urls: string[] = []
  let navigations = 0
  let centerRequests = 0
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/notifications') centerRequests++ })
  page.on('websocket', (socket) => {
    urls.push(socket.url())
    socket.on('framereceived', ({ payload }) => {
      const frame = JSON.parse(String(payload))
      if (frame.event === 'pusher_internal:subscription_succeeded') subscriptions.push(frame.channel)
      if (frame.event === 'Illuminate\\Notifications\\Events\\BroadcastNotificationCreated') {
        notifications.push({ channel: frame.channel, data: typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data })
      }
    })
  })
  return {
    notifications,
    urls,
    navigationCount: () => navigations,
    centerRequestCount: () => centerRequests,
    async subscribed() {
      await expect.poll(() => subscriptions.filter(channel => channel.startsWith('private-user.')).length,
        { message: 'Reverb confirmed the private user channel before publication', timeout: 20_000 }).toBeGreaterThan(0)
      expect(urls.some(url => url.startsWith(e2e.webOrigin.replace('http:', 'ws:') + '/app/'))).toBe(true)
      // Finish initialization snapshots before measuring live delivery.
      await page.waitForLoadState('networkidle')
    },
    async delivered(title: string) {
      await expect.poll(() => notifications.find(frame => frame.data.title === title), { timeout: 20_000 }).toBeTruthy()
      const frame = notifications.find(frame => frame.data.title === title)!
      expect(frame.data.type).toBe('notification.created')
      expect(frame.channel).toMatch(/^private-user\./)
      return frame.data
    },
  }
}

async function publish(page: Page, title: string, body: string) {
  await page.getByTestId('publish').click()
  await page.getByLabel('Заголовок').fill(title)
  await page.getByLabel('Текст', { exact: true }).fill(body)
  const response = page.waitForResponse(response => response.url().endsWith('/api/v1/announcements') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click()
  const published = await response
  expect(published.status()).toBe(201)
  return ((await published.json()) as { data: { id: string } }).data.id
}

test('a published announcement reaches the notification center live', async ({ page, openPhone }, testInfo) => {
  await loginAsAdmin(page)
  await createGlobalRole(page, reader.globalRole, ['Видеть справочник'])
  let live!: ReturnType<typeof observeNotifications>
  const phone = await createInvitedAccount(page, async () => {
    const phone = await openPhone()
    live = observeNotifications(phone)
    return phone
  }, reader)
  await live.subscribed()
  await expect(phone.getByTestId('notification-badge')).toHaveCount(0)
  const navigationCount = live.navigationCount()
  const centerRequestCount = live.centerRequestCount()
  await openSection(page, 'Объявления', 'Объявления')
  const title = 'Собрание церкви — живое объявление e2e'
  const id = await publish(page, title, 'В воскресенье в **10:00**')
  const notification = await live.delivered(title)
  expect(notification.url).toBe(`/announcements/${id}`)
  await expect(phone.getByTestId('notification-badge')).toHaveText('1')
  expect(live.navigationCount(), 'the reader stayed on the same document').toBe(navigationCount)
  expect(live.centerRequestCount(), 'the live badge required no notification HTTP refresh').toBe(centerRequestCount)
  await testInfo.attach('live-notification', { body: JSON.stringify({ sockets: live.urls, notification, documentNavigations: navigationCount, centerRequests: centerRequestCount }, null, 2), contentType: 'application/json' })
  await openSection(phone, 'Уведомления', 'Уведомления')
  await expect(phone.getByTestId(`notification-${notification.id}`)).toHaveClass(/unread/)
  await Promise.all([
    expectApiResponse(phone, 'POST', '/notifications/read', 200),
    expectApiResponse(phone, 'GET', `/announcements/${id}`, 200),
    phone.getByTestId(`notification-${notification.id}`).click(),
  ])
  await expect(phone).toHaveURL(`/announcements/${id}`)
  await expect(phone.locator('strong', { hasText: '10:00' })).toBeVisible()
  await expect(phone.getByTestId('notification-badge')).toHaveCount(0)
  await openSection(phone, 'Уведомления', 'Уведомления')
  await expect(phone.getByTestId(`notification-${notification.id}`)).not.toHaveClass(/unread/)
})

test('a ministry announcement reaches a member but is hidden from a non-member', async ({ page, openPhone }, testInfo) => {
  // Two independently invited accounts plus membership setup through the UI.
  test.setTimeout(240_000)
  await loginAsAdmin(page)
  const observations: ReturnType<typeof observeNotifications>[] = []
  const observedPhone = async () => {
    const phone = await openPhone()
    observations.push(observeNotifications(phone))
    return phone
  }
  await createGlobalRole(page, member.globalRole, ['Видеть справочник'])
  await createGlobalRole(page, stranger.globalRole, ['Видеть справочник'])
  const memberPhone = await createInvitedAccount(page, observedPhone, member)
  const strangerPhone = await createInvitedAccount(page, observedPhone, stranger)
  await Promise.all(observations.map(live => live.subscribed()))
  await createMinistry(page, 'Объявления — служение e2e')
  const ministryLink = page.getByRole('link', { name: 'Объявления — служение e2e', exact: true })
  const ministryPath = (await ministryLink.getAttribute('href'))!
  await Promise.all([expectApiResponse(page, 'GET', ministryPath, 200), ministryLink.click()])
  const tabs = page.getByRole('navigation', { name: 'Разделы служения' })
  await Promise.all([
    expectApiResponse(page, 'GET', `${ministryPath}/members`, 200),
    expectApiResponse(page, 'GET', `${ministryPath}/roles`, 200),
    tabs.getByRole('link', { name: 'Участники' }).click(),
  ])
  await addMember(page, member.lastName, fullName(member))
  await Promise.all([expectApiResponse(page, 'GET', '/announcements', 200), tabs.getByRole('link', { name: 'Объявления' }).click()])
  const title = 'Репетиция служения — объявление e2e'
  const id = await publish(page, title, 'В субботу')
  // Authorized delivery is the queue witness: absence alone could pass too early.
  const witness = await observations[0]!.delivered(title)
  await expect(memberPhone.getByTestId('notification-badge')).toHaveText('1')
  await openSection(strangerPhone, 'Объявления', 'Объявления')
  await expect(strangerPhone.getByText(title, { exact: true })).toHaveCount(0)
  await openSection(strangerPhone, 'Уведомления', 'Уведомления')
  await expect(strangerPhone.getByText(title, { exact: true })).toHaveCount(0)
  await expect(strangerPhone.getByTestId('notification-badge')).toHaveCount(0)
  expect(observations[1]!.notifications.some(frame => frame.data.title === title)).toBe(false)
  // Direct access also enforces visibility, using the recipient's real session.
  const forbidden = await strangerPhone.request.get(`${e2e.webOrigin}/api/v1/announcements/${id}`, {
    headers: { Accept: 'application/json', Referer: strangerPhone.url() },
  })
  expect(forbidden.status()).toBe(403)
  await testInfo.attach('ministry-visibility', { body: JSON.stringify({ announcementId: id, witness, outsiderNotifications: observations[1]!.notifications, directStatus: forbidden.status() }, null, 2), contentType: 'application/json' })
})
