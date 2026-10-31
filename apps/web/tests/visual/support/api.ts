import type { Page } from '@playwright/test'
import type { components } from '../../../types/api'

/** Визуальные данные; серверные права и операции проверяет настоящий e2e. */
export async function mockVisualApi(page: Page, guest = false) {
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }))
  await page.route('**/broadcasting/auth', route => route.fulfill({ json: { auth: 'visual:signature' } }))
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let body: unknown = { data: [], meta: { current_page: 1, last_page: 1, total: 0 }, next_cursor: null, unread_count: 0 }
    let status = 200
    if (path === '/auth/me') {
      status = guest ? 401 : 200
      body = guest ? { message: 'Unauthenticated' } : {
        user: { id: 'u-visual', email: 'visual@example.test', phone: null, ical_url: 'https://example.test/calendar.ics' },
        person: { id: 'p-visual', first_name: 'Анна', last_name: 'Петрова', patronymic: null, status: 'member' },
        permissions: { administrator: true, global: [], ministries: {} },
      }
    } else if (path === '/settings') {
      body = { data: { church_name: 'Наша церковь', timezone: 'Europe/Moscow', phone_region: 'RU', reverb_key: 'visual', vapid_public_key: '' } }
    } else if (path === '/people') {
      const data: components['schemas']['PersonResource'][] = [
        { id: 'p-visual', first_name: 'Анна', last_name: 'Петрова', patronymic: 'Сергеевна', full_name: 'Петрова Анна Сергеевна', status: 'member', archived: false, photo_url: null, has_account: true, user_id: 'u-visual', has_global_roles: true, account_disabled: false },
        { id: 'p-other', first_name: 'Михаил', last_name: 'Иванов', patronymic: null, full_name: 'Иванов Михаил', status: 'attendee', archived: false, photo_url: null, has_account: false, user_id: null, has_global_roles: false, account_disabled: false },
      ]
      body = { data, meta: { current_page: 1, last_page: 1, total: data.length } }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.routeWebSocket('**/app/**', (socket) => {
    socket.send(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: '1.1', activity_timeout: 120 }) }))
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw))
      if (message.event === 'pusher:subscribe') {
        socket.send(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel: message.data.channel, data: '{}' }))
      }
    })
  })
}
