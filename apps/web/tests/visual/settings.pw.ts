import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

const longRole = 'Роль'.repeat(25)
const ministry = { id: 'm-settings', name: 'Музыкальное служение', default_role_id: 'long', description: null, cover_url: null, archived: false }
const longAgent = 'UnknownBrowser/' + 'x'.repeat(1500)
async function fixtures(page: Page) {
  await mockVisualApi(page)
  await page.route('**/api/v1/me/profile', route => route.fulfill({ json: { data: { photo_url: null, contacts: { phone: '+79990000000', email: 'anna@example.test', birth_date: '1990-01-01' }, contacts_public: true } } }))
  await page.route('**/api/v1/auth/sessions', route => route.fulfill({ json: { data: [
    { id: 'current', current: true, user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36', ip_address: '127.0.0.1', last_activity: '2026-11-01T10:00:00Z' },
    { id: 'unknown', current: false, user_agent: longAgent, ip_address: '2001:db8::1', last_activity: null },
  ] } }))
  await page.route('**/api/v1/roles?*', route => route.fulfill({ json: { data: [
    { id: 'system', name: 'Администратор', description: null, permissions: [], is_system: true },
    { id: 'long', name: longRole, description: 'Описание роли', permissions: ['people.view'], is_system: false },
  ] } }))
  await page.route('**/api/v1/ministries/m-settings', route => route.fulfill({ json: { data: ministry } }))
  await page.route('**/api/v1/ministries/m-settings/roles', route => route.fulfill({ json: { data: [{ id: 'long', name: longRole, description: null, permissions: [], is_system: false }] } }))
  await page.route('**/api/v1/ministries/m-settings/members', route => route.fulfill({ json: { data: [{ id: 'member', person_id: 'p-visual', full_name: longRole, photo_url: null, roles: [{ id: 'long', name: longRole }] }] } }))
  await page.route('**/api/v1/notification-settings', route => route.fulfill({ json: { data: [{ category: 'announcements', label: 'Объявления', enabled: true }] } }))
  await page.route('**/api/v1/permissions', route => route.fulfill({ json: { data: [{ key: 'people.view', scope: 'global', label: longRole, description: 'Видеть справочник' }] } }))
}
async function screenshot(page: Page, path: string) {
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
  await page.screenshot({ path, fullPage: true })
}
async function fit(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  for (const control of await page.locator('main input:not([type=checkbox]), main select, main textarea, main button').all()) {
    if (!await control.isVisible()) continue
    const box = (await control.boundingBox())!
    expect(box.width).toBeGreaterThan(40)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
  }
}
for (const [width, scale] of [[320, 1], [768, 1], [1440, 1], [320, 2], [768, 2]] as const) {
  test(`settings and editors fit ${width}px text ${scale * 100}%`, async ({ page }, info) => {
    await fixtures(page)
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/settings/profile', '/settings/devices', '/settings/ical', '/settings/notifications', '/admin/settings', '/admin/audit', '/admin/roles', '/ministries/m-settings/roles', '/ministries/m-settings/members', '/people']) {
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
      if (path.endsWith('/roles')) await page.locator('[data-test=select-role-long]').click()
      if (path === '/people') await page.locator('[data-test=create-person]').click()
      await fit(page, width)
      if (path === '/settings/profile') {
        expect((await page.locator('form').boundingBox())!.width).toBeLessThanOrEqual(640 * scale)
        expect((await page.locator('[data-test=save-profile]').boundingBox())!.height).toBeLessThanOrEqual(44 * scale + 1)
        if (width === 320 && scale === 2) {
          expect.soft((await page.locator('input[name=birth_date]').boundingBox())!.width).toBeGreaterThanOrEqual(250)
          expect.soft(await page.locator('.profile-page__checkbox').evaluate(el => {
            const text = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('Показывать'))!
            const start = text.textContent!.indexOf('Показывать')
            const range = document.createRange(); range.setStart(text, start); range.setEnd(text, start + 'Показывать'.length)
            return range.getClientRects().length
          })).toBe(1)
        }
        expect(await page.locator('[data-test=save-profile]').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(35, 78, 121)')
      }
      if (path === '/settings/devices') expect.soft((await page.locator('[data-test=end-unknown]').boundingBox())!.height).toBeLessThanOrEqual(44 * scale + 1)
      if (width === 320 || width === 1440) await screenshot(page, info.outputPath(path.slice(1).replaceAll('/', '-') + '.png'))
    }
  })
}
test('devices show friendly labels, keep the original collapsed and protect the current device', async ({ page }) => {
  await fixtures(page)
  await page.goto('/settings/devices')
  await expect(page.getByText('Chrome · Windows', { exact: true })).toBeVisible()
  await expect(page.getByText('Устройство', { exact: true })).toBeVisible()
  await expect(page.locator('[data-test=end-current]')).toBeDisabled()
  const details = page.locator('details').last()
  await expect(details).not.toHaveAttribute('open')
  await details.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(details).toHaveAttribute('open', '')
  await expect(details).toContainText(longAgent)
  await fit(page, 1280)
})
test('settings links work with keyboard and system role stays readonly', async ({ page }) => {
  await fixtures(page)
  await page.goto('/settings/profile')
  const login = page.getByRole('navigation', { name: 'Разделы настроек' }).getByRole('link', { name: 'Вход', exact: true })
  await login.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/settings\/login$/)
  await expect(login).toHaveAttribute('aria-current', 'page')
  await page.goto('/admin/roles')
  await page.locator('[data-test=select-role-system]').click()
  await expect(page.locator('[data-test=role-name]')).toBeDisabled()
  await expect(page.locator('[data-test=save-role]')).toHaveCount(0)
  await expect(page.locator('[data-test=delete-role]')).toHaveCount(0)
})
