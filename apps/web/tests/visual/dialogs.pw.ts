import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

async function expectContained(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const dialog = page.locator('dialog[open]')
  const geometry = await dialog.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right }))
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(page.viewportSize()!.width)
}

test('file chooser is reachable by Tab and opens with Enter and Space', async ({ page }) => {
  await mockVisualApi(page)
  await page.route('**/api/v1/me/profile', route => route.fulfill({ json: { data: { photo_url: null, contacts: { phone: null, email: null, birth_date: null }, contacts_public: false } } }))
  await page.goto('/settings/profile')
  const choose = page.getByRole('button', { name: 'Выбрать фото', exact: true })
  await expect(choose).toBeVisible()
  for (let i = 0; i < 35 && !await choose.evaluate(el => el === document.activeElement); i++) await page.keyboard.press('Tab')
  await expect(choose).toBeFocused()
  for (const key of ['Enter', 'Space']) {
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press(key)
    await (await chooser).setFiles([])
    await expect(choose).toBeFocused()
  }
})

test('new group traps keyboard focus, Escape closes and returns focus', async ({ page }) => {
  await mockVisualApi(page)
  await page.goto('/chats')
  const trigger = page.getByRole('button', { name: 'Новая группа', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Новая группа', exact: true })
  await expect(dialog.locator('input[data-test="title"]')).toBeFocused()
  await dialog.evaluate(el => {
    for (const attrs of [{ hidden: '' }, { disabled: '' }, { tabindex: '-1' }, { style: 'display:none' }]) {
      const button = document.createElement('button')
      button.textContent = 'Недоступное действие'
      for (const [name, value] of Object.entries(attrs)) button.setAttribute(name, value)
      el.append(button)
    }
  })
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.locator('input[data-test="title"]')).toBeFocused()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i < 6 ? 'Shift+Tab' : 'Tab')
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await trigger.evaluate(element => element.remove())
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeVisible()
  await expect(page.locator('#main-content')).toBeFocused()
})

for (const width of [320, 768, 1440]) {
  for (const scale of [1, 2]) {
    test('iCal confirmation fits ' + width + ' at text ' + scale * 100 + '% and reports failure', async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 600 })
      await mockVisualApi(page)
      await page.route('**/api/v1/me/ical-token/rotate', route => route.fulfill({ status: 503, json: {} }))
      await page.goto('/settings/ical')
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
      const trigger = page.getByRole('button', { name: 'Перевыпустить ссылку', exact: true })
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Перевыпуск ссылки календаря' })
      await expect(dialog).toBeVisible()
      await expectContained(page)
      const confirm = dialog.getByRole('button', { name: 'Подтвердить перевыпуск' })
      if (scale === 2) {
        const wordFragments = await confirm.evaluate(el => {
          const text = el.firstChild!
          const word = 'Подтвердить'
          const start = text.textContent!.indexOf(word)
          const range = document.createRange()
          range.setStart(text, start); range.setEnd(text, start + word.length)
          return range.getClientRects().length
        })
        expect(wordFragments).toBe(1)
      }
      await confirm.click()
      await expect(dialog.getByRole('alert')).toContainText('Не удалось обновить ссылку')
      await expectContained(page)
      await page.screenshot({ path: testInfo.outputPath('ical-' + width + '-' + scale + '.png') })
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
    })
  }
}

test('file upload disables selection while busy, reports errors and permits retry', async ({ page }) => {
  await mockVisualApi(page)
  const profile = { photo_url: null, contacts: { phone: null, email: null, birth_date: null }, contacts_public: false }
  await page.route('**/api/v1/me/profile', route => route.fulfill({ json: { data: profile } }))
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  await page.route('**/api/v1/media', async route => { await pending; await route.fulfill({ status: 422, json: { message: 'Слишком большой файл.' } }) })
  await page.goto('/settings/profile')
  const choose = page.getByRole('button', { name: 'Выбрать фото', exact: true })
  await expect(choose).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('photo') })
  await expect(page.getByRole('button', { name: 'Загружается…' })).toBeDisabled()
  finish()
  await expect(page.getByRole('alert')).toContainText('Слишком большой файл.')
  await expect(choose).toBeEnabled()
})

test('busy dialog keeps focus when every action is disabled', async ({ page }) => {
  await mockVisualApi(page)
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  await page.route('**/api/v1/me/ical-token/rotate', async route => { await pending; await route.fulfill({ status: 503, json: {} }) })
  await page.goto('/settings/ical')
  await page.getByRole('button', { name: 'Перевыпустить ссылку', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Перевыпуск ссылки календаря' })
  await dialog.getByRole('button', { name: 'Подтвердить перевыпуск' }).click()
  await expect(dialog.getByRole('button', { name: 'Обновляется…' })).toBeDisabled()
  for (const key of ['Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('#main-content')).toBeFocused()
  finish()
})

test('dialog does not steal Tab from another native modal', async ({ page }) => {
  await mockVisualApi(page)
  await page.goto('/chats')
  await page.getByRole('button', { name: 'Новая группа', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Новая группа', exact: true })
  await page.evaluate(() => {
    const other = document.createElement('dialog')
    other.id = 'other-modal'
    other.innerHTML = '<button type="button">Другое действие</button>'
    document.body.append(other)
    other.showModal()
  })
  await expect(page.locator('#other-modal button')).toBeFocused()
  await page.locator('#other-modal button').evaluate(el => (el as HTMLElement).blur())
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(false)
  }
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Новая группа', exact: true })).toBeFocused()
})
