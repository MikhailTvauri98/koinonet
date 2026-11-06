import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

const chat = { id: 'c-layout', title: 'Подготовка воскресного служения', type: 'group', avatar_url: null, archived: false, muted_until: null, members: [{ user_id: 'u-visual', full_name: 'Анна Петрова' }], pinned_messages: [], can_write: true, can_moderate: true, can_manage_members: true, is_owner: true }
const messages = Array.from({ length: 25 }, (_, index) => ({ id: `msg-${index}`, chat_id: chat.id, body: index === 23 ? 'ДлинноеСообщение'.repeat(70) : `Сообщение ${index + 1}: Встречаемся в воскресенье.`, sender: { id: 'u-visual', person: { id: 'p-visual', full_name: 'Анна Петрова', photo_thumb_url: null } }, attachments: index === 22 ? [{ id: 'file', kind: 'document', url: '/example.pdf', thumb_url: null }] : [], reply_to: null, deleted: false, edited_at: null, created_at: `2026-11-01T10:00:${String(index).padStart(2, '0')}.000001Z`, cursor: `cursor-${index}` }))
async function fixtures(page: Page, readonly = false, archived = false) {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style'); style.textContent = 'nuxt-devtools-frame { display: none !important; }'; document.head.append(style)
  }, { once: true }))
  await mockVisualApi(page)
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (path === '/media' && route.request().method() === 'POST') await route.fulfill({ json: { data: { id: 'selected-file', status: 'ready', kind: 'document' } } })
    else if (path === '/chats/c-layout') await route.fulfill({ json: { data: { ...chat, archived, can_write: !readonly, can_moderate: !readonly, members: readonly ? [] : chat.members } } })
    else if (path === '/chats/c-layout/messages') await route.fulfill({ json: { data: messages, next_before: null, next_after: null } })
    else if (path === '/ministries/m-layout') await route.fulfill({ json: { data: { id: 'm-layout', name: 'Музыкальное служение', chat_id: chat.id, archived: false } } })
    else await route.fallback()
  })
}
async function fits(page: Page) {
  const send = await page.locator('[data-test=send]').boundingBox()
  const nav = await page.locator('.app-nav').boundingBox()
  expect(send).not.toBeNull()
  // Use the actual navigation edge, including a wrapped/enlarged navigation.
  const limit = nav && nav.y > 0 ? nav.y : page.viewportSize()!.height
  expect(send!.y + send!.height).toBeLessThanOrEqual(limit + 1)
  // Chromium can round a scrolled edge by a fraction of one CSS pixel.
  await expect(page.locator('[data-test=send]')).toBeInViewport({ ratio: 0.995 })
  await expect(page.locator('[data-test=composer]')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
}
for (const scenario of [{ width: 375, height: 390, path: '/chats/c-layout' }, { width: 375, height: 844, path: '/ministries/m-layout/chat' }]) {
  test(`composer and latest message fit ${scenario.path} ${scenario.width}x${scenario.height}`, async ({ page }, info) => {
    await fixtures(page)
    await page.setViewportSize(scenario)
    await page.goto(scenario.path)
    await expect(page.locator('[data-test=composer]')).toBeVisible()
    await expect(page.locator('[data-test=menu]')).toBeInViewport({ ratio: 1 })
    await fits(page)
    await expect(page.locator('[data-test=latest-message]')).toBeInViewport()
    await page.screenshot({ path: info.outputPath('chat.png'), fullPage: true })
    await page.setViewportSize({ width: 844, height: 390 })
    await fits(page)
    await expect(page.locator('[data-test=latest-message]')).toBeInViewport()
  })
}
test('message actions are explicit, keyboard reachable and return focus at 375x500', async ({ page }, info) => {
  await fixtures(page)
  await page.setViewportSize({ width: 375, height: 500 })
  await page.goto('/chats/c-layout')
  const trigger = page.locator('[data-test=actions-msg-24]')
  await expect(trigger).toBeVisible()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Действия сообщения' })
  await expect(dialog).toBeVisible()
  for (const name of ['Ответить', 'Изменить', 'Удалить', 'Закрепить', 'Закрыть']) await expect(dialog.getByRole('button', { name, exact: true })).toBeInViewport()
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press(i < 3 ? 'Shift+Tab' : 'Tab')
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  await page.screenshot({ path: info.outputPath('message-menu.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.locator('[data-test=menu]').click()
  await expect(page.getByRole('dialog', { name: 'Меню чата' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('chat-menu.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await fits(page)
})

test('reply, edit, attachment and read-only states remain reachable', async ({ page }, info) => {
  await fixtures(page)
  await page.setViewportSize({ width: 375, height: 500 })
  await page.goto('/chats/c-layout')
  await page.locator('[data-test=actions-msg-24]').click()
  await page.getByRole('button', { name: 'Ответить', exact: true }).click()
  await expect(page.locator('[data-test=composer]')).toBeFocused()
  await page.locator('[data-test=composer]').fill('Ответ на сообщение')
  await expect(page.getByRole('button', { name: 'Отменить ответ' })).toBeVisible()
  await page.locator('[data-test=send]').scrollIntoViewIfNeeded()
  await fits(page)
  await page.getByRole('button', { name: 'Отменить ответ' }).click()
  await page.locator('[data-test=actions-msg-24]').click()
  await page.getByRole('button', { name: 'Изменить', exact: true }).click()
  await expect(page.locator('[data-test=composer]')).toHaveValue(messages[24]!.body)
  await page.locator('[data-test=send]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-test=send]')).toHaveText('Сохранить')
  await fits(page)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await page.locator('[data-test=file-input]').setInputFiles({ name: 'План.txt', mimeType: 'text/plain', buffer: Buffer.from('План служения') })
  await expect(page.getByRole('button', { name: 'Убрать План.txt' })).toBeVisible()
  await page.locator('[data-test=send]').scrollIntoViewIfNeeded()
  await fits(page)
  await page.locator('[data-message-id=msg-22]').scrollIntoViewIfNeeded()
  await expect(page.getByRole('link', { name: 'Открыть вложение' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('attachment-history.png'), fullPage: true })
})
for (const archived of [false, true]) test(`history remains usable ${archived ? 'archived' : 'read-only'}`, async ({ page }) => {
  await fixtures(page, !archived, archived)
  await page.setViewportSize({ width: 375, height: 390 })
  await page.goto('/chats/c-layout')
  await expect(page.getByText(archived ? 'Чат архивирован' : 'Чат доступен только для чтения', { exact: true })).toBeInViewport()
  await expect(page.locator('[data-test=composer]')).toHaveCount(0)
  await expect(page.locator('[data-test^=actions-]')).toHaveCount(0)
  await expect(page.locator('[data-test=latest-message]')).toBeInViewport()
})
for (const height of [390, 844]) test(`enlarged text stays enlarged and composer controls can be reached at 375x${height}`, async ({ page }, info) => {
  await fixtures(page)
  await page.setViewportSize({ width: 375, height })
  await page.goto('/ministries/m-layout/chat')
  await expect(page.locator('[data-test=composer]')).toBeVisible()
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await expect.poll(() => page.locator('[data-test=composer]').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(32)
  // Extreme height uses one outer scroll flow, not tiny clipped panes.
  for (const selector of ['.ministry-chat__navigation', '.chat-header', '.composer']) {
    expect(await page.locator(selector).evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  }
  await page.locator('[data-test=composer]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-test=composer]')).toBeInViewport({ ratio: 1 })
  await page.locator('[data-test=composer]').fill('Сообщение крупным шрифтом')
  await page.locator('[data-test=send]').scrollIntoViewIfNeeded()
  const send = await page.locator('[data-test=send]').boundingBox()
  const nav = await page.locator('.app-nav').boundingBox()
  const fixed = await page.locator('.app-nav').evaluate(element => getComputedStyle(element).position === 'fixed')
  expect(send!.y + send!.height).toBeLessThanOrEqual((fixed ? nav!.y : height) + 1)
  await expect(page.locator('[data-test=send]')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({ path: info.outputPath('text200.png'), fullPage: true })
})
