import { expect, test, type Page, type TestInfo } from '@playwright/test'
import type { components } from '../../types/api'
import { mockVisualApi } from './support/api'

const screens = [
  { path: '/login', title: 'Вход', kind: null },
  { path: '/invite/visual-link', title: 'Приглашение', kind: 'invite' },
  { path: '/password-reset/visual-link', title: 'Сброс пароля', kind: 'password_reset' },
] as const

function linkInfo(kind: string): components['schemas']['AccessLinkResource'] {
  return {
    kind,
    person: { first_name: 'Мария', last_name: 'Константинопольская-Рождественская' },
    login_hint: { phone: null, email: 'maria@example.test' },
  }
}

async function checkForms(page: Page, width: number) {
  const fields = page.locator('form input:not([type=checkbox])')
  expect(await fields.count()).toBeGreaterThan(0)
  const heights: number[] = []
  for (const field of await fields.all()) {
    const metrics = await field.evaluate((input) => {
      const label = input.closest('label')!
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT)
      let text = walker.nextNode()
      while (text && !text.textContent?.trim()) text = walker.nextNode()
      const range = document.createRange()
      range.selectNodeContents(text!)
      const caption = range.getBoundingClientRect()
      const box = input.getBoundingClientRect()
      return { captionBottom: caption.bottom, top: box.top, left: box.left, right: box.right, height: box.height }
    })
    expect(metrics.captionBottom).toBeLessThanOrEqual(metrics.top)
    expect(metrics.left).toBeGreaterThanOrEqual(12)
    expect(metrics.right).toBeLessThanOrEqual(width - 12)
    expect(metrics.height).toBeGreaterThanOrEqual(44)
    heights.push(metrics.height)
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  const submit = page.locator('button[type=submit]').last()
  await submit.scrollIntoViewIfNeeded()
  await expect(submit).toBeInViewport()
  const box = await submit.boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight))
  const nav = page.getByRole('navigation', { name: 'Основная навигация' })
  if (width < 768 && await nav.count()) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const lastButton = await submit.boundingBox()
    expect(lastButton!.y + lastButton!.height).toBeLessThanOrEqual((await nav.boundingBox())!.y)
  }
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true })
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('church.ui.theme', value), theme)
    })
for (const [width, fontScale] of [[320, 1], [375, 1], [390, 1], [767, 1], [768, 1], [1024, 1], [1440, 1], [320, 2], [768, 2], [1440, 2]] as const) {
  test('auth forms fit ' + width + 'px with text at ' + fontScale * 100 + '%', async ({ page }, info) => {
    await mockVisualApi(page, true)
    await page.setViewportSize({ width, height: 900 })
    for (const screen of screens) {
      if (screen.kind) await page.route('**/api/v1/access-links/visual-link', route => route.fulfill({ json: { data: linkInfo(screen.kind!) } }))
      await page.goto(screen.path)
      await expect(page.getByRole('heading', { name: screen.title, exact: true })).toBeVisible()
      await expect(page.locator('form')).toBeVisible()
      if (fontScale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
      await checkForms(page, width)
      expect((await page.locator('form').boundingBox())!.width).toBeLessThanOrEqual(448 * fontScale)
      if ([390, 1440].includes(width) || fontScale === 2) await screenshot(page, info, screen.kind ?? 'login')
    }
    await mockVisualApi(page)
    await page.goto('/settings/login')
    await expect(page.getByRole('heading', { name: 'Безопасность', exact: true })).toBeVisible()
    if (fontScale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
    await checkForms(page, width)
    for (const field of await page.locator('input[autocomplete=current-password]').all()) {
      await expect(field).not.toHaveAttribute('minlength')
    }
    await expect(page.locator('[data-test=password-new]')).toHaveAttribute('minlength', '8')
    await expect(page.locator('[data-test=password-new]')).toHaveAttribute('autocomplete', 'new-password')
    if ([390, 1440].includes(width) || fontScale === 2) await screenshot(page, info, 'settings')
  })
}

for (const screen of screens.filter(screen => screen.kind !== null)) {
  test(screen.kind + ' shows loading before the link is verified', async ({ page }, info) => {
    await mockVisualApi(page, true)
    await page.setViewportSize({ width: 375, height: 390 })
    let release!: () => void
    const ready = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/api/v1/access-links/visual-link', async (route) => {
      await ready
      await route.fulfill({ json: { data: linkInfo(screen.kind!) } })
    })
    try {
      await page.goto(screen.path)
      await expect(page.getByRole('main').getByRole('status')).toContainText('Проверяем ссылку')
      await expect(page.locator('form')).toHaveCount(0)
      await screenshot(page, info, 'loading')
    } finally { release() }
    await expect(page.locator('form')).toBeVisible()
    await checkForms(page, 375)
  })

  test(screen.kind + ' keeps expired and invalid links inside the same readable screen', async ({ page }, info) => {
    await mockVisualApi(page, true)
    await page.setViewportSize({ width: 320, height: 568 })
    for (const code of ['expired', 'used', 'revoked', 'invalid']) {
      await page.route('**/api/v1/access-links/visual-link', route => route.fulfill({
        status: 422, json: { code: 'access_link.' + code, message: 'Ошибка' },
      }))
      await page.goto(screen.path)
      await expect(page.getByRole('heading', { name: screen.title, exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page.locator('form')).toHaveCount(0)
      const back = page.getByRole('link', { name: 'Перейти ко входу' })
      await expect(back).toHaveAttribute('href', '/login')
      await back.focus()
      await expect(back).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
      if (code === 'expired') await screenshot(page, info, 'expired')
    }
  })
}

for (const screen of screens) {
  test((screen.kind ?? 'login') + ' shows submitting and error states on a short phone screen', async ({ page }, info) => {
    await mockVisualApi(page, true)
    await page.setViewportSize({ width: 375, height: 390 })
    if (screen.kind) await page.route('**/api/v1/access-links/visual-link', route => route.fulfill({ json: { data: linkInfo(screen.kind!) } }))
    let release!: () => void
    const response = new Promise<void>((resolve) => { release = resolve })
    let sent: Record<string, unknown> | undefined
    await page.route(screen.kind ? '**/api/v1/access-links/visual-link/accept' : '**/api/v1/auth/login', async (route) => {
      sent = route.request().postDataJSON()
      await response
      await route.fulfill({ status: 422, json: { message: 'Не удалось сохранить изменения. Проверьте данные и повторите попытку.' } })
    })
    await page.goto(screen.path)
    await expect(page.locator('form')).toBeVisible()
    if (screen.kind !== 'password_reset') await page.locator('[data-test=login]').fill('maria@example.test')
    await page.locator('[data-test=password]').fill(screen.kind ? 'secret123' : 'old')
    if (screen.kind) await page.locator('[data-test=password-confirmation]').fill('secret123')
    try {
      await page.locator('button[type=submit]').click()
      await expect.poll(() => sent).toBeDefined()
      await expect(page.locator('button[type=submit]')).toBeDisabled()
      await expect(page.locator('button[type=submit]')).toContainText('…')
      if (screen.kind) {
        await expect(page.locator('[data-test=password]')).toHaveValue('')
        await expect(page.locator('[data-test=password-confirmation]')).toHaveValue('')
        expect(sent!.password).toBe('secret123')
        if (screen.kind === 'password_reset') expect(sent).not.toHaveProperty('login')
      }
    } finally { release() }
    await expect(page.getByRole('alert')).toContainText('Проверьте данные')
    await expect(page.locator('button[type=submit]')).toBeEnabled()
    await checkForms(page, 375)
    await screenshot(page, info, 'submit-error')
  })
}

test('login works with the keyboard and preserves current-password autocomplete', async ({ page }, info) => {
  await mockVisualApi(page, true)
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/login?passwordChanged=1')
  await expect(page.getByRole('main').getByRole('status')).toContainText('Пароль изменён')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Телефон или email', { exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  const password = page.getByLabel('Пароль', { exact: true })
  await expect(password).toBeFocused()
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  await expect(password).not.toHaveAttribute('minlength')
  expect(await password.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('checkbox')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('checkbox')).toBeChecked()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeFocused()
  await screenshot(page, info, 'success-notice')
})

  })
}
