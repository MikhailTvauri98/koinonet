import { expect, test, type Page, type Locator } from '@playwright/test'
import { mockVisualApi } from './support/api'

async function setup(page: Page, theme: string, scale: number) {
  await mockVisualApi(page)
  await page.addInitScript(({ theme, scale }) => {
    localStorage.setItem('church.ui.theme', theme)
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = `${scale}%`
      const style = document.createElement('style'); style.textContent = 'nuxt-devtools-frame { display: none !important }'; document.head.append(style)
    })
  }, { theme, scale })
  await page.route('**/api/v1/notifications/read', route => route.fulfill({ json: { unread_count: 1 } }))
  await page.route('**/api/v1/notifications', route => route.fulfill({ json: { data: [
    { id: 'long', category: 'assignments', title: 'Напоминание о назначении', body: 'Пожалуйста, проверьте время и место события. '.repeat(8), url: '/calendar', read_at: null, created_at: '2026-11-01T10:00:00Z' },
  ], meta: { unread_count: 2 }, next_cursor: null } }))
}
async function readable(page: Page, target: Locator) {
  await target.evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expect(target).toBeInViewport({ ratio: 1 })
  const box = (await target.boundingBox())!
  const hit = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.app-nav')),
    { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  expect(hit).toBe(false)
}
for (const theme of ['dark', 'light']) {
  for (const [width, height, scale] of [[320, 390, 200], [375, 390, 100], [320, 900, 200], [390, 844, 100], [768, 900, 100], [1440, 1000, 100]] as const) {
    test(`${theme} ${width}x${height} ${scale}% keeps navigation and notification readable`, async ({ page }, info) => {
      await setup(page, theme, scale)
      await page.setViewportSize({ width, height })
      await page.goto('/notifications')
      const nav = page.getByRole('navigation', { name: 'Основная навигация', exact: true })
      await expect(page.locator('[data-test=notification-long]')).toBeVisible()
      if (width === 320 && height === 390) await expect(nav).toHaveCSS('position', 'static')
      const row = page.locator('[data-test=notification-long]')
      await row.focus()
      await readable(page, row.locator('strong'))
      await page.screenshot({ path: info.outputPath('notification-title.png') })
      await readable(page, row.locator('.notification-list__meta'))
      await page.screenshot({ path: info.outputPath('notification-action.png') })
      await row.press('Enter')
      await expect(page).toHaveURL(/\/calendar$/)
      if (width < 768) {
        const destinations = nav.locator(':scope > a:not(.app-nav__secondary), :scope > button')
        await destinations.first().focus()
        for (let index = 0; index < 5; index++) {
          const item = destinations.nth(index)
          await expect(item).toBeFocused()
          await expect(item).toBeInViewport({ ratio: 1 })
          if (index < 4) await page.keyboard.press('Tab')
        }
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog', { name: 'Ещё', exact: true })
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('link')).toHaveCount(9)
        await page.screenshot({ path: info.outputPath('more.png') })
        await page.keyboard.press('Escape')
        await expect(destinations.last()).toBeFocused()
      } else await expect(nav).toHaveCSS('position', 'sticky')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: info.outputPath('navigation.png'), fullPage: true })
    })
  }
  test(`${theme} viewport and font resizing restore the fixed menu`, async ({ page }, info) => {
    await setup(page, theme, 200)
    await page.setViewportSize({ width: 320, height: 390 })
    await page.goto('/notifications')
    const nav = page.locator('.app-nav')
    await expect(nav).toHaveCSS('position', 'static')
    await page.setViewportSize({ width: 320, height: 900 })
    await expect(nav).toHaveCSS('position', 'fixed')
    await page.setViewportSize({ width: 320, height: 390 })
    await expect(nav).toHaveCSS('position', 'static')
    await page.evaluate(() => { document.documentElement.style.fontSize = '100%' })
    await expect(nav).toHaveCSS('position', 'fixed')
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await expect(nav).toHaveCSS('position', 'static')
    await page.setViewportSize({ width: 768, height: 390 })
    await expect(nav).toHaveCSS('position', 'sticky')
    await expect(page.locator('.app-layout')).not.toHaveClass(/app-layout--nav-flow/)
    await page.screenshot({ path: info.outputPath('resized-desktop.png') })
  })
}

for (const theme of ['dark', 'light']) test(`${theme} flow keeps chat history, composer and focused form usable`, async ({ page }, info) => {
  await setup(page, theme, 200)
  await page.setViewportSize({ width: 320, height: 390 })
  await page.route('**/api/v1/chats/c-short', route => route.fulfill({ json: { data: {
    id: 'c-short', title: 'Подготовка воскресного служения', type: 'group', avatar_url: null, archived: false, muted_until: null,
    members: [{ user_id: 'u-visual', full_name: 'Анна Петрова' }], pinned_messages: [], can_write: true, can_moderate: true, can_manage_members: true, is_owner: true,
  } } }))
  await page.route('**/api/v1/chats/c-short/messages', route => route.fulfill({ json: { data: [], next_before: null, next_after: null } }))
  await page.goto('/chats/c-short')
  await expect(page.locator('.app-layout')).toHaveClass(/app-layout--nav-flow/)
  const composer = page.locator('[data-test=composer]')
  await composer.focus()
  await composer.fill('Сообщение крупным шрифтом')
  await readable(page, composer)
  expect(await page.locator('.message-list').evaluate(element => element.clientHeight)).toBeGreaterThanOrEqual(192)
  await readable(page, page.locator('[data-test=send]'))
  await page.screenshot({ path: info.outputPath('chat-composer.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(composer).toHaveValue('Сообщение крупным шрифтом')
  await expect(page.locator('.app-layout')).not.toHaveClass(/app-layout--nav-flow/)
  await page.goto('/settings/login')
  await page.setViewportSize({ width: 320, height: 390 })
  const login = page.locator('[data-test=login]')
  await login.fill('')
  await page.locator('[data-test=save-login]').click()
  await expect(login).toBeFocused()
  await readable(page, login)
  await page.screenshot({ path: info.outputPath('form-focus.png') })
  await login.fill('anna@example.test')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(login).toHaveValue('anna@example.test')
})
