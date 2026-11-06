import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

const empty = { data: [], meta: { current_page: 1, last_page: 1, total: 0, unread_count: 0 }, next_cursor: null }
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  for (const button of await page.locator('#main-content button, .route-loading').all()) {
    if (!await button.isVisible()) continue
    const box = await button.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  }
}

test('delayed navigation announces loading, preserves the current screen and finishes on the destination', async ({ page }, info) => {
  await mockVisualApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Здравствуйте, Анна!' })).toBeVisible()
  let release!: () => void
  const delayed = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/people?**', async route => { await delayed; await route.fulfill({ json: empty }) })
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Люди', exact: true }).click()
  await expect(page.locator('.route-loading[role=status]')).toContainText('Загружаем страницу')
  await expect(page.getByRole('heading', { name: 'Здравствуйте, Анна!' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('route-loading.png'), fullPage: true })
  release()
  await expect(page.getByRole('heading', { name: 'Люди', exact: true })).toBeVisible()
  await expect(page.locator('.route-loading')).toHaveCount(0)
  await expect(page.locator('#main-content .empty-state')).toContainText('Создайте человека')
})

for (const theme of ['dark', 'light'] as const) {
for (const [width, scale] of [[320, 200], [390, 100], [1440, 100]] as const) {
  test(`${theme} ${width}px text ${scale}%: errors retry, empty next steps and reduced motion remain readable`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
    await mockVisualApi(page)
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(percent => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = `html { font-size: ${percent}% !important } nuxt-devtools-frame { display: none !important }`
        document.head.append(style)
      }, { once: true })
    }, scale)
    let fail = true
    await page.route('**/api/v1/announcements?**', route => route.fulfill({ status: fail ? 500 : 200, json: fail ? { message: 'Private diagnostic' } : empty }))
    await page.goto('/announcements')
    await expect(page.locator('#main-content [role=alert]')).toContainText('Не удалось загрузить объявления')
    await expect(page.locator('#main-content')).not.toContainText('Объявлений пока нет')
    await expect(page.locator('#main-content')).not.toContainText('Private diagnostic')
    await fits(page)
    await page.screenshot({ path: info.outputPath('error.png'), fullPage: true })
    fail = false
    let release!: () => void
    const delayed = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/v1/announcements?**', async route => { await delayed; await route.fallback() })
    await page.getByRole('button', { name: 'Повторить', exact: true }).click()
    await expect(page.locator('#main-content .loading-state')).toContainText('Загружаем объявления')
    await expect(page.locator('#main-content .loading-state__spinner')).toHaveCSS('animation-name', 'none')
    await expect(page.locator('#main-content')).not.toContainText('Объявлений пока нет')
    await fits(page)
    await page.screenshot({ path: info.outputPath('retry-loading.png'), fullPage: true })
    release()
    await expect(page.locator('#main-content .empty-state')).toContainText('Опубликуйте первое объявление')
    await expect(page.getByRole('button', { name: 'Опубликовать объявление', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('empty.png'), fullPage: true })
    await page.goto('/calendar')
    await expect(page.locator('#main-content .empty-state')).toContainText('Событий пока нет.')
    await fits(page)
    await page.goto('/chats')
    await expect(page.locator('#main-content .empty-state')).toContainText('Новая группа')
    await expect(page.getByRole('button', { name: 'Новая группа', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Новое сообщение', exact: true })).toBeVisible()
    await fits(page)
    await page.goto('/notifications')
    await expect(page.locator('#main-content .empty-state')).toContainText('назначения')
    await fits(page)
  })
}
}

test('offline session check blocks protected content and retry restores the confirmed session', async ({ page }, info) => {
  await mockVisualApi(page)
  let fail = true
  await page.route('**/api/v1/auth/me', async route => fail ? route.abort('internetdisconnected') : route.fallback())
  await page.goto('/people')
  await expect(page.getByRole('alert')).toContainText('Нет связи с сервером')
  await expect(page.getByRole('heading', { name: 'Люди', exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('connection-blocking.png'), fullPage: true })
  fail = false
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Люди', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('401 clears the session while 403 refreshes permissions and shows a refusal', async ({ page }) => {
  await mockVisualApi(page)
  await page.route('**/api/v1/people?**', route => route.fulfill({ status: 403, json: { message: 'Internal denial' } }))
  await page.goto('/people')
  await expect(page.locator('#main-content [role=alert]')).toContainText('Нет права на это действие.')
  await expect(page).toHaveURL(/\/people$/)
  await expect(page.locator('#main-content')).not.toContainText('Люди не найдены')
  await page.route('**/api/v1/people?**', route => route.fulfill({ status: 401, json: {} }))
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Вход', exact: true })).toBeVisible()
  await expect(page.locator('.route-loading')).toHaveCount(0)
})

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, scale] of [[390, 844, 100], [1440, 1000, 100], [320, 900, 200], [375, 390, 100], [320, 390, 200]] as const) {
    test(`task18 ${theme} ${width}x${height}px ${scale}%: system connection, installation and push states`, async ({ page }, info) => {
      await mockVisualApi(page)
      await page.setViewportSize({ width, height })
      await page.addInitScript(({ theme, scale }) => {
        localStorage.setItem('church.ui.theme', theme)
        document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${scale}%`; const style = document.createElement('style'); style.textContent = 'nuxt-devtools-frame { display: none !important }'; document.head.append(style) })
      }, { theme, scale })
      let offline = true
      await page.route('**/api/v1/auth/me', route => offline ? route.abort('internetdisconnected') : route.fallback())
      await page.goto('/notifications')
      await expect(page.locator('.connection-lost--blocking')).toContainText('Нет связи с сервером')
      await expect(page.locator('#main-content')).toHaveCount(0)
      await fits(page)
      await page.screenshot({ path: info.outputPath(`connection-${height}h.png`), fullPage: true })
      offline = false
      await page.getByRole('button', { name: 'Повторить', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Уведомления', exact: true })).toBeVisible()
      await expect(page.locator('.notifications-page .empty-state')).toContainText('Уведомлений пока нет')
      await page.screenshot({ path: info.outputPath(`notifications-empty-${height}h.png`), fullPage: true })
      await page.evaluate(() => {
        const event = Object.assign(new Event('beforeinstallprompt'), { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'accepted' }) })
        window.dispatchEvent(event)
      })
      await expect(page.locator('[data-test=install-prompt]')).toContainText('домашнем экране')
      await page.screenshot({ path: info.outputPath(`install-browser-${height}h.png`), fullPage: true })
      await page.locator('[data-test=install-button]').focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('[data-test=install-prompt]')).toHaveCount(0)
      await page.getByRole('link', { name: 'Настройки уведомлений', exact: true }).click()
      await expect(page).toHaveURL(/\/settings\/notifications$/)
      await expect(page.getByRole('link', { name: 'Устройства', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Пуши на этом устройстве', exact: true })).toHaveCount(1)
      await page.screenshot({ path: info.outputPath(`push-settings-${height}h.png`), fullPage: true })
      // API refusal refreshes /auth/me; a failed refresh preserves the confirmed session.
      offline = true
      await page.route('**/api/v1/notifications', route => route.fulfill({ status: 403, json: {} }))
      await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: /Уведомления/ }).click()
      await expect(page.locator('.connection-lost')).toContainText('Не удалось обновить права')
      await expect(page.locator('.connection-lost--blocking')).toHaveCount(0)
      await expect(page.locator('#main-content')).toBeVisible()
      await page.screenshot({ path: info.outputPath(`connection-refresh-${height}h.png`), fullPage: true })
    })

    test(`task18 ${theme} ${width}x${height}px ${scale}%: iOS browser instructions and standalone push failure`, async ({ page }, info) => {
      await mockVisualApi(page)
      await page.setViewportSize({ width, height })
      await page.addInitScript(({ theme, scale }) => {
        localStorage.setItem('church.ui.theme', theme)
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1' })
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
        document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${scale}%`; const style = document.createElement('style'); style.textContent = 'nuxt-devtools-frame { display: none !important }'; document.head.append(style) })
      }, { theme, scale })
      await page.goto('/notifications')
      await expect(page.locator('[data-test=install-prompt]')).toContainText('Поделиться')
      await expect(page.locator('.enable-notifications')).toContainText('Safari')
      await fits(page)
      await page.screenshot({ path: info.outputPath(`install-ios-${height}h.png`), fullPage: true })
      await page.locator('[data-test=dismiss-install]').click()
      await expect(page.locator('[data-test=install-prompt]')).toHaveCount(0)
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
        Object.defineProperty(navigator.serviceWorker, 'getRegistration', { configurable: true, value: async () => ({ pushManager: { getSubscription: async () => { throw new Error('unavailable') } } }) })
      })
      await page.reload()
      await expect(page.locator('[data-test=install-prompt]')).toHaveCount(0)
      await expect(page.locator('.push-error')).toContainText('прежнего аккаунта')
      await expect(page.locator('.enable-notifications')).not.toContainText('откройте его в Safari')
      await page.getByRole('button', { name: 'Повторить проверку пушей' }).click()
      await expect(page.locator('.push-error')).toBeVisible()
      await fits(page)
      await page.screenshot({ path: info.outputPath(`push-lifecycle-error-${height}h.png`), fullPage: true })
    })
  }
}
