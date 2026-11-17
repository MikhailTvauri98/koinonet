import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

const chat = { id: 'c-1', title: 'Подготовка воскресного служения', type: 'group', avatar_url: null, archived: false, muted_until: null, members: [{ user_id: 'u-visual', full_name: 'Анна Петрова' }], pinned_messages: [], can_write: true, can_moderate: true, can_manage_members: true, is_owner: true }
const message = { id: 'm-1', chat_id: chat.id, body: 'Встречаемся в воскресенье.', sender: { id: 'u-visual', person: { id: 'p-visual', full_name: 'Анна Петрова', photo_thumb_url: null } }, attachments: [], reply_to: null, deleted: false, edited_at: null, created_at: '2026-11-01T10:00:00.000001Z', cursor: 'c-0' }
const listed = { data: [{ ...chat, unread_count: 2, last_message: { id: 'm-1', body_preview: 'Встречаемся в воскресенье.', deleted: false, created_at: message.created_at }, last_message_at: message.created_at }], meta: { unread_total: 2 } }

async function setup(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style'); style.textContent = 'nuxt-devtools-frame { display: none !important; }'; document.head.append(style)
  }, { once: true }))
  await mockVisualApi(page)
  let down = false
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (path === '/chats') return down ? route.abort('failed') : route.fulfill({ json: listed })
    if (path === '/chats/c-1') return route.fulfill({ json: { data: chat } })
    if (path === '/chats/c-1/messages') return route.fulfill({ json: { data: [message], next_before: null, next_after: null } })
    return route.fallback()
  })
  return { drop: () => { down = true }, restore: () => { down = false } }
}

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    test(`${theme} ${width}px: a lost connection is one calm status on home and in chat, with no red text`, async ({ page }, info) => {
      await page.setViewportSize({ width, height })
      const link = await setup(page, theme)
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Здравствуйте, Анна!' })).toBeVisible()
      await expect(page.getByText('Подготовка воскресного служения').first()).toBeVisible()
      await expect(page.getByText('Нет связи')).toHaveCount(0)

      link.drop()
      await page.evaluate(() => window.dispatchEvent(new Event('offline')))
      await expect(page.getByRole('status').filter({ hasText: 'Нет связи. Переподключаемся…' })).toHaveCount(1)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.getByText('Подготовка воскресного служения').first()).toBeVisible()
      await page.screenshot({ path: info.outputPath('home-offline.png'), fullPage: true })

      await page.goto('/chats/c-1')
      await expect(page.locator('.chat-header h1')).toHaveText('Подготовка воскресного служения')
      await expect(page.getByRole('status').filter({ hasText: 'Нет связи' })).toHaveCount(1)
      await expect(page.getByText('Встречаемся в воскресенье.')).toBeVisible()
      await expect(page.locator('[data-test=send]')).toBeVisible()
      await page.screenshot({ path: info.outputPath('chat-offline.png') })

      link.restore()
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(page.getByText('Нет связи')).toHaveCount(0)
    })
  }
}

test('dark 390px: the retry button appears after the third failure and the bar disappears on recovery', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const link = await setup(page, 'dark')
  link.drop()
  await page.goto('/')
  await expect(page.getByRole('status').filter({ hasText: 'Нет связи' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: info.outputPath('retry.png') })
  link.restore()
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByText('Нет связи')).toHaveCount(0)
})
