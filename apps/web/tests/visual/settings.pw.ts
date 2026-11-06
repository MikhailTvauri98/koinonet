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
  for (const label of await page.locator('main .ui-choice').all()) {
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  for (const control of await page.locator('main input:not([type=checkbox], [type=radio]), main select, main textarea, main button').all()) {
    if (!await control.isVisible()) continue
    const box = (await control.boundingBox())!
    expect(box.width).toBeGreaterThan(40)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
  }
}
for (const theme of ['dark', 'light'] as const) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('church.ui.theme', value), theme)
    })
for (const [width, scale] of [[320, 1], [390, 1], [768, 1], [1440, 1], [320, 2], [768, 2]] as const) {
  test(`settings and editors fit ${width}px text ${scale * 100}%`, async ({ page }, info) => {
    await fixtures(page)
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/settings/profile', '/settings/login', '/settings/appearance', '/settings/devices', '/settings/ical', '/settings/notifications', '/admin/settings', '/admin/audit', '/admin/roles', '/ministries/m-settings/roles', '/ministries/m-settings/members', '/people']) {
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
      if (path.endsWith('/roles')) await page.locator('[data-test=select-role-long]').click()
      if (path === '/people') {
        await page.locator('[data-test=create-person]').click()
        const birthDate = page.locator('.person-form input[name=birth_date]')
        await birthDate.fill('1990-01-01')
        await expect(birthDate).toHaveValue('1990-01-01')
        if (width === 320 && scale === 2) expect.soft((await birthDate.boundingBox())!.width).toBeGreaterThanOrEqual(250)
      }
      await fit(page, width)
      if (path === '/settings/profile') {
        expect((await page.locator('form').boundingBox())!.width).toBeLessThanOrEqual(896 * scale)
        expect((await page.locator('[data-test=save-profile]').boundingBox())!.height).toBeLessThanOrEqual(44 * scale + 1)
        if (width === 320 && scale === 2) {
          expect.soft((await page.locator('input[name=birth_date]').boundingBox())!.width).toBeGreaterThanOrEqual(250)
          expect.soft(await page.locator('.profile-page__checkbox span').evaluate(el => {
            const range = document.createRange(); range.selectNodeContents(el)
            return range.getClientRects().length
          })).toBeGreaterThan(0)
        }
        expect(await page.locator('[data-test=save-profile]').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(theme === 'dark' ? 'rgb(145, 180, 255)' : 'rgb(49, 95, 198)')
      }
      if (path === '/settings/devices') expect.soft((await page.locator('[data-test=end-unknown]').boundingBox())!.height).toBeLessThanOrEqual(44 * scale + 1)
      if (width === 320 || width === 390 || width === 1440) {
        await screenshot(page, info.outputPath(path.slice(1).replaceAll('/', '-') + '.png'))
        if (path === '/people') {
          const birthDate = page.locator('.person-form input[name=birth_date]')
          await birthDate.evaluate(el => el.scrollIntoView({ block: 'center' }))
          await birthDate.screenshot({ path: info.outputPath('people-date.png') })
        }
      }
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
  const login = page.getByRole('navigation', { name: 'Разделы настроек' }).getByRole('link', { name: 'Безопасность', exact: true })
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

  })
}


test('appearance choice survives public pages and logout; failed logout preserves the account', async ({ page }, info) => {
  await fixtures(page)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/settings/appearance')
  await expect(page.getByLabel('Тёмная', { exact: true })).toBeChecked()
  await page.getByLabel('Светлая', { exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.getByLabel('Светлая', { exact: true })).toBeChecked()
  await page.goto('/settings/profile')
  await page.route('**/api/v1/auth/logout', route => route.fulfill({ status: 500, json: { message: 'Ошибка выхода' } }))
  await page.locator('[data-test=logout]').click()
  await expect(page.locator('[data-test=logout-error]')).toContainText('Не удалось выйти. Попробуйте ещё раз.')
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible()
  await expect(page).toHaveURL(/settings\/profile$/)
  await screenshot(page, info.outputPath('failed-logout-light.png'))
  await page.route('**/api/v1/auth/logout', route => route.fulfill({ status: 204 }))
  await page.locator('[data-test=logout]').click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('church.ui.theme'))).toBe('light')
  await screenshot(page, info.outputPath('public-after-logout-light.png'))
})

test('appearance switches when device storage is blocked', async ({ page }) => {
  await fixtures(page)
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem
    Object.defineProperty(Storage.prototype, 'getItem', { value(key: string) {
      if (key === 'church.ui.theme') throw new Error('blocked')
      return get.call(this, key)
    } })
    Object.defineProperty(Storage.prototype, 'setItem', { value(key: string, value: string) {
      if (key === 'church.ui.theme') throw new Error('blocked')
      return set.call(this, key, value)
    } })
  })
  await page.goto('/settings/appearance')
  await expect(page.getByLabel('Тёмная', { exact: true })).toBeChecked()
  await page.getByLabel('Светлая', { exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})


for (const theme of ['dark', 'light'] as const) {
  test(`field error names and saved profile retry stay usable in ${theme}`, async ({ page }, info) => {
    await fixtures(page)
    await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
    await page.setViewportSize({ width: 390, height: 900 })
    await page.route('**/api/v1/me/profile', route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 422, json: { errors: { phone: ['Проверьте телефон.'] } } })
      : route.fallback())
    await page.goto('/settings/profile')
    const phone = page.getByRole('textbox', { name: 'Телефон', exact: true })
    await phone.fill('wrong')
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(phone).toHaveAttribute('aria-invalid', 'true')
    await expect(phone).toHaveAccessibleName('Телефон')
    await expect(phone).toHaveAccessibleDescription('Проверьте телефон.')
    await screenshot(page, info.outputPath('profile-field-error.png'))
    let allowRead = false
    await page.route('**/api/v1/me/profile', route => {
      if (route.request().method() === 'PATCH') return route.fulfill({ json: { data: { id: 'p-visual' } } })
      return !allowRead ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { data: { photo_url: null, contacts: { phone: '+79991234567', email: null, birth_date: null }, contacts_public: true } } })
    })
    await phone.fill('8 (999) 123-45-67')
    await page.locator('[data-test=save-profile]').click()
    await expect(page.locator('[data-test=profile-saved]')).toContainText('Сохранено')
    await expect(page.locator('[data-test=retry-profile-refresh]')).toBeVisible()
    await expect(phone).toHaveValue('8 (999) 123-45-67')
    await screenshot(page, info.outputPath('profile-saved-read-error.png'))
    allowRead = true
    await page.locator('[data-test=retry-profile-refresh]').click()
    await expect(phone).toHaveValue('+79991234567')
    await page.route('**/api/v1/me/login', route => route.fulfill({ status: 422, json: { errors: { login: ['Этот логин уже занят.'], current_password: ['Проверьте пароль.'] } } }))
    await page.goto('/settings/login')
    const login = page.getByRole('textbox', { name: 'Новый логин (телефон или email)', exact: true })
    await login.fill('taken@example.test')
    await page.locator('[data-test=login-current-password]').fill('old')
    await page.locator('[data-test=save-login]').click()
    await expect(login).toHaveAttribute('aria-invalid', 'true')
    await expect(login).toHaveAccessibleName('Новый логин (телефон или email)')
    await expect(login).toHaveAccessibleDescription('Этот логин уже занят.')
    await expect(page.locator('[data-test=login-current-password]')).toHaveAccessibleName('Текущий пароль')
    await screenshot(page, info.outputPath('security-field-error.png'))
  })
}


for (const theme of ['dark', 'light'] as const) {
  for (const [width, scale] of [[390, 1], [1440, 1], [320, 2]] as const) {
    test(`compact settings actions in ${theme} ${width}px text ${scale * 100}%`, async ({ page }, info) => {
      await fixtures(page)
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/settings/profile', '/settings/devices', '/settings/ical']) {
        await page.goto(path)
        await expect(page.locator('main h1')).toBeVisible()
        if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
        await fit(page, width)
        if (path.endsWith('/profile')) {
          const save = page.locator('[data-test=save-profile]')
          await save.scrollIntoViewIfNeeded()
          const nav = page.getByRole('navigation', { name: 'Основная навигация' })
          if (width < 768) expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual((await nav.boundingBox())!.y)
          await page.evaluate(() => scrollTo(0, 0))
        }
        if (width === 1440 && path.endsWith('/ical')) expect((await page.locator('[data-test=copy]').boundingBox())!.width).toBeLessThan(400)
        await screenshot(page, info.outputPath(path.slice(1).replaceAll('/', '-') + '.png'))
      }
    })
  }
}


for (const theme of ['dark', 'light'] as const) {
  for (const [width, scale] of [[390, 1], [1440, 1], [320, 2]] as const) {
    test(`profile groups avoid blank rows in ${theme} ${width}px text ${scale * 100}%`, async ({ page }, info) => {
      await fixtures(page)
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/settings/profile')
      await expect(page.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible()
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
      const photo = page.locator('.profile-page__photo-section')
      const contacts = page.locator('.profile-page__contacts-section')
      const visibility = page.locator('.profile-page__visibility-section')
      const a = (await photo.boundingBox())!, b = (await contacts.boundingBox())!, c = (await visibility.boundingBox())!
      if (width === 1440) {
        expect(b.x).toBeGreaterThan(a.x + a.width)
        expect(c.x).toBe(a.x)
        expect(c.y - (a.y + a.height)).toBeLessThanOrEqual(40)
        expect(c.y).toBeLessThan(b.y + b.height)
      } else {
        expect(b.y).toBeGreaterThanOrEqual(a.y + a.height)
        expect(c.y).toBeGreaterThanOrEqual(b.y + b.height)
      }
      expect(await contacts.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('.profile-page__visibility-section')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
      await fit(page, width)
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await screenshot(page, info.outputPath('settings-profile.png'))
    })
  }
}


async function administrationScreenshot(page: Page, path: string) {
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await page.screenshot({ path, fullPage: true })
}

// Task 19 owns only the administrative scenarios below.
for (const theme of ['dark', 'light'] as const) {
  for (const [width, scale] of [[390, 1], [1440, 1], [390, 2]] as const) {
    test(`administration forms in ${theme} ${width}px text ${scale * 100}%`, async ({ page }, info) => {
      await fixtures(page)
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/admin/settings', '/admin/roles', '/ministries/m-settings/roles']) {
        await page.goto(path)
        await expect(page.locator('main h1')).toBeVisible()
        if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important }' })
        if (path.endsWith('/roles')) await page.locator('[data-test=select-role-long]').click()
        await expect(page.locator('.ui-form-section').first()).toBeVisible()
        await fit(page, width)
        for (const button of await page.locator('main .ui-button--primary').all()) {
          expect(await button.evaluate(el => getComputedStyle(el).color)).toBe(theme === 'dark' ? 'rgb(20, 33, 59)' : 'rgb(255, 255, 255)')
        }
        await administrationScreenshot(page, info.outputPath(path.slice(1).replaceAll('/', '-') + '.png'))
      }
      await page.goto('/admin/roles')
      await page.locator('[data-test=select-role-system]').click()
      await expect(page.locator('[data-test=role-name]')).toBeDisabled()
      await expect(page.locator('[data-test=save-role]')).toHaveCount(0)
      await administrationScreenshot(page, info.outputPath('system-role.png'))
    })
  }

  test(`administration errors and deletion dialog in ${theme}`, async ({ page }, info) => {
    await fixtures(page)
    await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
    await page.setViewportSize({ width: 390, height: 640 })
    await page.route('**/api/v1/settings', route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 422, json: { errors: { timezone: ['Часовой пояс не найден.'] } } }) : route.fallback())
    await page.goto('/admin/settings')
    await page.addStyleTag({ content: 'html { font-size: 32px !important }' })
    const timezone = page.getByRole('textbox', { name: 'Часовой пояс', exact: true })
    await timezone.fill('Mars/Olympus')
    await page.locator('[data-test=save-settings]').click()
    await expect(timezone).toBeFocused()
    await expect(timezone).toHaveAccessibleName('Часовой пояс')
    await expect(timezone).toHaveAccessibleDescription('Часовой пояс не найден.')
    const field = (await timezone.boundingBox())!, nav = (await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox())!
    expect(field.y + field.height).toBeLessThanOrEqual(nav.y)
    await administrationScreenshot(page, info.outputPath('settings-field-error-200.png'))
    let failUsage = true
    await page.route('**/api/v1/roles/long/usage', route => failUsage
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { data: { carriers: 3, blockers: [{ type: 'default_role', id: 'm-settings', title: 'Роль по умолчанию' }] } } }))
    await page.goto('/admin/roles')
    await page.addStyleTag({ content: 'html { font-size: 32px !important }' })
    await page.locator('[data-test=select-role-long]').click()
    await page.route('**/api/v1/roles/long', route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 422, json: { errors: { name: ['Это название уже занято.'] } } }) : route.fallback())
    const roleName = page.getByRole('textbox', { name: 'Название', exact: true })
    await roleName.fill('Новое название')
    await page.locator('[data-test=save-role]').click()
    await expect(roleName).toBeFocused()
    await expect(roleName).toHaveAccessibleName('Название')
    await expect(roleName).toHaveAccessibleDescription('Это название уже занято.')
    await administrationScreenshot(page, info.outputPath('role-field-error-200.png'))
    const opener = page.locator('[data-test=delete-role]')
    await opener.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveClass('ui-dialog')
    await expect(dialog.locator('h2')).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: info.outputPath('role-usage-viewport.png') })
    await expect(dialog.locator('[data-test=close-usage]')).toBeVisible()
    await administrationScreenshot(page, info.outputPath('role-usage-error-200.png'))
    failUsage = false
    await dialog.locator('[data-test=retry-usage]').click()
    await expect(dialog).toContainText('Роль по умолчанию')
    await expect(dialog.locator('[data-test=confirm-delete]')).toHaveCount(0)
    await fit(page, 390)
    await administrationScreenshot(page, info.outputPath('role-usage-blocked-200.png'))
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
}


// Task 16 owns only the people form scenarios below.
for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, scale] of [[390, 900, 1], [1440, 900, 1], [320, 900, 2], [390, 390, 2]] as const) {
    test(`task16 people form and focus in ${theme} ${width}x${height} text ${scale * 100}%`, async ({ page }, info) => {
      await fixtures(page)
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height })
      await page.route('**/api/v1/people', route => route.request().method() === 'POST'
        ? route.fulfill({ status: 422, json: { errors: { phone: ['Проверьте телефон.'] } } }) : route.fallback())
      await page.goto('/people')
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size:32px !important }' })
      const create = page.locator('[data-test=create-person]')
      await create.click()
      await expect(page.getByRole('textbox', { name: 'Фамилия', exact: true })).toBeFocused()
      await page.getByRole('textbox', { name: 'Фамилия', exact: true }).fill('Константинопольский')
      await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Александр')
      await page.locator('[name=birth_date]').fill('1990-03-15')
      await fit(page, width)
      if (width === 1440) {
        const groups = page.locator('.person-form .ui-form-section')
        expect((await groups.nth(1).boundingBox())!.x).toBeGreaterThan((await groups.nth(0).boundingBox())!.x)
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await screenshot(page, info.outputPath('people-form.png'))
      const phone = page.getByRole('textbox', { name: 'Телефон', exact: true })
      await phone.fill('wrong')
      await page.locator('[data-test=save-person]').click()
      await expect(phone).toBeFocused()
      await expect(phone).toBeEnabled()
      await expect(phone).toHaveAccessibleName('Телефон')
      await expect(phone).toHaveAccessibleDescription('Проверьте телефон.')
      const bounds = (await phone.boundingBox())!
      const nav = page.getByRole('navigation', { name: 'Основная навигация' })
      if (await nav.evaluate(el => getComputedStyle(el).position === 'fixed')) expect(bounds.y + bounds.height).toBeLessThanOrEqual((await nav.boundingBox())!.y)
      else { expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height) }
      await page.screenshot({ path: info.outputPath('people-field-error-viewport.png') })
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await screenshot(page, info.outputPath('people-field-error.png'))
      await page.locator('[data-test=cancel-person]').click()
      await expect(create).toBeFocused()
      await fit(page, width)
    })
  }
}
