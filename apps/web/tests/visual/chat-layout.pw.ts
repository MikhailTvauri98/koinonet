import { writeFile } from 'node:fs/promises'
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
    else if (path === '/chats') await route.fulfill({ json: { data: [{ ...chat, unread_count: 3, last_message: { id: 'msg-24', body_preview: 'Подготовим\nзал\nдля\nвоскресного\nслужения\nЗатем\nпроверим\nзвук\nи\nосвещение', deleted: false, created_at: messages[24]!.created_at }, last_message_at: messages[24]!.created_at }, { ...chat, id: 'c-other', title: 'Михаил Орлов', unread_count: 0, last_message: null, last_message_at: null }], meta: { unread_total: 3 } } })
    else if (path === '/chats/c-other') await route.fulfill({ json: { data: { ...chat, id: 'c-other', title: 'Михаил Орлов' } } })
    else if (path === '/chats/c-other/messages') await route.fulfill({ json: { data: [], next_before: null, next_after: null } })
    else if (path === '/chats/c-layout') await route.fulfill({ json: { data: { ...chat, archived, can_write: !readonly, can_moderate: !readonly, members: readonly ? [] : chat.members } } })
    else if (path === '/chats/c-layout/messages') await route.fulfill({ json: { data: messages, next_before: null, next_after: null } })
    else if (path === '/ministries/m-layout') await route.fulfill({ json: { data: { id: 'm-layout', name: 'Музыкальное служение', description: null, cover_url: null, color: 'violet', members_count: 4, default_role_id: null, chat_id: chat.id, archived_at: null } } })
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
  await expect(page.getByRole('dialog', { name: 'Сведения о чате' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('chat-menu.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await fits(page)
})

test('reply, edit, attachment and read-only states remain reachable', async ({ page }, info) => {
  await fixtures(page)
  await page.setViewportSize({ width: 375, height: 500 })
  await page.goto('/chats/c-layout')
  await page.locator('[data-message-id=msg-24]').hover()
  await page.locator('[data-test=actions-msg-24]').click()
  await page.getByRole('button', { name: 'Ответить', exact: true }).click()
  await expect(page.locator('[data-test=composer]')).toBeFocused()
  await page.locator('[data-test=composer]').fill('Ответ на сообщение')
  await expect(page.getByRole('button', { name: 'Отменить ответ' })).toBeVisible()
  await page.locator('[data-test=send]').scrollIntoViewIfNeeded()
  await fits(page)
  await page.getByRole('button', { name: 'Отменить ответ' }).click()
  await page.locator('[data-message-id=msg-24]').hover()
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

for (const theme of ['dark', 'light']) test(`workspace keeps desktop list, local search and mobile return ${theme}`, async ({ page }, info) => {
  await fixtures(page)
  await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/chats/c-layout?from=push')
  const pane = page.locator('.chat-workspace__list')
  await expect(pane).toBeVisible()
  const box = (await pane.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(280)
  expect(box.width).toBeLessThanOrEqual(320)
  await expect(pane.locator('a[aria-current="page"]')).toHaveAttribute('href', '/chats/c-layout')
  const preview = pane.locator('a[aria-current="page"] .chat-item__preview')
  const previewSize = await preview.evaluate(element => ({ height: element.clientHeight, line: parseFloat(getComputedStyle(element).lineHeight) }))
  expect(previewSize.height, 'multiline preview stays on one line').toBeLessThanOrEqual(previewSize.line + 1)
  await expect(pane.locator('a[aria-current="page"] .chat-item__title')).toHaveText('Подготовка воскресного служения')

  await expect(page.locator('[data-test=latest-message]')).toBeInViewport()
  await page.locator('[data-test=composer]').fill('Черновик выбранного чата')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(pane).toBeHidden()
  await expect(page.locator('.chat-screen')).toHaveCount(1)
  await expect(page.locator('[data-test=composer]')).toHaveValue('Черновик выбранного чата')
  await page.setViewportSize({ width: 1024, height: 844 })
  await expect(pane).toBeVisible()
  await page.setViewportSize({ width: 1023, height: 844 })
  await expect(pane).toBeHidden()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(pane).toBeVisible()
  await expect(page.locator('.chat-screen')).toHaveCount(1)
  await expect(page.locator('[data-test=composer]')).toHaveValue('Черновик выбранного чата')
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1000)
  await page.screenshot({ path: info.outputPath(theme + '-1440-workspace.png'), fullPage: true })
  const search = pane.getByRole('searchbox', { name: 'Найти чат' })
  await search.fill('михаил')
  await expect(pane.locator('.chat-item')).toHaveCount(1)
  await expect(page.locator('[data-test=composer]')).toHaveValue('Черновик выбранного чата')
  await search.fill('ничего')
  await expect(pane.getByText('Чаты не найдены', { exact: true })).toBeVisible()
  await search.fill('')
  await pane.getByRole('link', { name: /Михаил Орлов/ }).click()
  await expect(page.locator('.chat-header h1')).toHaveText('Михаил Орлов')
  await expect(page.locator('[data-test=composer]')).toHaveValue('')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(pane).toBeHidden()
  const back = page.locator('[data-test=chat-back]')
  await expect(back).toBeVisible()
  await expect(back).toHaveAttribute('href', '/chats')
  await page.screenshot({ path: info.outputPath(theme + '-390-chat.png'), fullPage: true })
  await back.click()
  await expect(page).toHaveURL(/\/chats$/)
  await expect(pane).toBeVisible()
  await expect(page.locator('.chat-screen')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath(theme + '-390-list.png'), fullPage: true })
})

for (const theme of ['dark', 'light']) for (const width of [320, 375]) test(`workspace flow with messages and rotation ${theme} ${width} text200`, async ({ page }, info) => {
  await fixtures(page)
  await page.addInitScript(value => {
    localStorage.setItem('church.ui.theme', value)
    document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%' }, { once: true })
  }, theme)
  await page.setViewportSize({ width, height: 390 })
  await page.goto('/ministries/m-layout/chat')
  await expect(page.locator('.app-layout')).toHaveClass(/app-layout--nav-flow/)
  await expect(page.locator('.chat-workspace__list')).toBeHidden()
  const back = page.locator('[data-test=chat-back]')
  await expect(back).toHaveAttribute('href', '/ministries/m-layout')
  for (const target of [back, page.locator('[data-test=menu]'), page.locator('[data-test=actions-msg-24]')]) {
    await target.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await expect(target).toBeInViewport({ ratio: 1 })
    const box = (await target.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.locator('.message-list').evaluate(element => element.clientHeight)).toBeGreaterThanOrEqual(192)
  const composer = page.locator('[data-test=composer]'), send = page.locator('[data-test=send]')
  await composer.fill('Черновик при повороте')
  for (const target of [composer, send]) {
    await target.focus()
    await target.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await expect(target).toBeInViewport({ ratio: 1 })
  }
  expect(await composer.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(32)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  await page.screenshot({ path: info.outputPath(`${theme}-${width}x390-200-composer.png`) })
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(composer).toHaveValue('Черновик при повороте')
  await send.focus()
  await send.scrollIntoViewIfNeeded()
  await writeFile(info.outputPath('rotation-controls.json'), JSON.stringify(await send.evaluate(element => {
    const rows = []; let current: Element | null = element
    while (current) { rows.push({ tag: current.tagName, class: current.className, box: current.getBoundingClientRect().toJSON(), clientWidth: current.clientWidth, scrollWidth: current.scrollWidth, overflow: getComputedStyle(current).overflow }); current = current.parentElement }
    return rows
  }), null, 2))
  await expect(send).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844)
  await page.screenshot({ path: info.outputPath(`${theme}-${width}-rotated-200.png`) })
})

for (const theme of ['dark', 'light']) test(`message menu footer remains reachable ${theme} 375x390 text200`, async ({ page }, info) => {
  await fixtures(page)
  await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
  await page.setViewportSize({ width: 375, height: 390 })
  await page.goto('/chats/c-layout')
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const trigger = page.locator('[data-test=actions-msg-24]')
  await trigger.scrollIntoViewIfNeeded()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Действия сообщения', exact: true })
  await expect(dialog).toBeVisible()
  for (const action of ['Ответить', 'Изменить', 'Удалить', 'Закрепить']) {
    const button = dialog.getByRole('button', { name: action, exact: true })
    await button.focus()
    await button.scrollIntoViewIfNeeded()
    await expect(button).toBeInViewport({ ratio: 1 })
  }
  const close = dialog.locator('.ui-dialog__actions').getByRole('button', { name: 'Закрыть', exact: true })
  await close.focus()
  await close.scrollIntoViewIfNeeded()
  await expect(close).toBeInViewport({ ratio: 1 })
  expect(await dialog.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto')
  await page.screenshot({ path: info.outputPath(`${theme}-375x390-200-message-menu-footer.png`) })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('message actions are hidden at rest, shown on hover and on focus inside, and stay in the tab order', async ({ page }) => {
  await fixtures(page)
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.goto('/chats/c-layout')
  const trigger = page.locator('[data-test=actions-msg-24]')
  await expect(trigger).toHaveCSS('opacity', '0')
  await page.locator('[data-message-id=msg-24]').hover()
  await expect(trigger).toHaveCSS('opacity', '1')
  await page.mouse.move(1, 1)
  await expect(trigger).toHaveCSS('opacity', '0')
  await trigger.focus()
  await expect(trigger).toHaveCSS('opacity', '1')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(trigger).toBeFocused()
})

const overlap = (a: { x: number, y: number, width: number, height: number }, b: { x: number, y: number, width: number, height: number }) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5
for (const theme of ['dark', 'light']) for (const [width, height, scale] of [[390, 844, 1], [1440, 900, 1], [320, 600, 2]] as const) {
  test(`chat list rows are compact at 100% and grow without overlap at 200% ${theme} ${width}x${height} ${scale * 100}%`, async ({ page }, info) => {
    await fixtures(page)
    await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
    await page.setViewportSize({ width, height })
    await page.goto('/chats')
    if (scale > 1) await page.addStyleTag({ content: `html { font-size: ${scale * 100}% !important; }` })
    const rows = page.locator('.chat-item')
    await expect(rows).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Написать', exact: true })).toBeVisible()
    expect((await page.getByRole('button', { name: 'Написать', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    for (const index of [0, 1]) {
      const row = rows.nth(index)
      const box = (await row.boundingBox())!
      if (scale === 1) {
        expect(box.height, 'row height at 100% text').toBeGreaterThanOrEqual(64)
        expect(box.height, 'row height at 100% text').toBeLessThanOrEqual(72)
        await expect(row.locator('time, .chat-item__title').first()).toBeVisible()
        for (const selector of ['.chat-item__title', '.chat-item__preview']) {
          const size = await row.locator(selector).evaluate(element => ({ height: element.clientHeight, line: parseFloat(getComputedStyle(element).lineHeight) }))
          expect(size.height, selector + ' is one line').toBeLessThanOrEqual(size.line + 1)
        }
      } else {
        expect(box.height, 'row grows at 200% text').toBeGreaterThan(72)
        const parts = []
        for (const selector of ['.ui-avatar', '.chat-item__title', '.chat-item__preview', 'time', '.chat-item__badge']) {
          const part = row.locator(selector)
          if (await part.count()) { const partBox = (await part.boundingBox())!; parts.push({ selector, ...partBox }); expect(partBox.x + partBox.width, selector + ' stays inside the row').toBeLessThanOrEqual(box.x + box.width + 0.5) }
        }
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) expect(overlap(parts[i]!, parts[j]!), `${parts[i]!.selector} and ${parts[j]!.selector} do not overlap`).toBe(false)
      }
      expect(await row.locator('.chat-item__preview').textContent()).not.toMatch(/Анна|Михаил/)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`chat-list-${theme}-${width}-${scale}.png`), fullPage: true })
  })
}
