import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { installAcceptanceApi } from './support/acceptance-api'
import { checkDocumentWidth, settleLayout, takeAcceptanceScreenshot } from './support/acceptance-layout'
import { measureWordWrapping } from './support/word-wrapping'

async function words(locator: Locator, maximum: number | null) {
  expect(await locator.count()).toBeGreaterThan(0)
  const measured = await locator.evaluateAll(measureWordWrapping, maximum)
  const geometry = await locator.evaluateAll(elements => elements.map(element => ({ text: element.textContent?.trim(), width: element.getBoundingClientRect().width, fontSize: getComputedStyle(element).fontSize })))
  return geometry.map((item, index) => ({ ...item, ...measured[index] }))
}

async function record(page: Page, info: TestInfo, name: string, measured: Awaited<ReturnType<typeof words>>) {
  await writeFile(info.outputPath(name + '.json'), JSON.stringify(measured, null, 2))
  await takeAcceptanceScreenshot(page, info, name)
  await checkDocumentWidth(page)
  for (const item of measured) expect.soft(item.broken, item.text).toEqual([])
}

async function focusAction(page: Page, action: Locator, info: TestInfo, name: string, focusTarget = action) {
  await focusTarget.focus()
  await expect(focusTarget).toBeFocused()
  await action.scrollIntoViewIfNeeded()
  const box = (await action.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(Math.min(box.y + box.height, page.viewportSize()!.height) - Math.max(box.y, 0)).toBeGreaterThanOrEqual(44)
  expect(await action.evaluate(element => {
    const box = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.x + box.width / 2, (Math.max(0, box.y) + Math.min(innerHeight, box.bottom)) / 2))
  })).toBe(true)
  await page.screenshot({ path: info.outputPath(name + '-focused.png') })
}

for (const theme of ['dark', 'light']) for (const scenario of ['people', 'notifications', 'template']) {
  test(theme + ': enlarged readable ' + scenario, async ({ page }, info) => {
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page)
    let payload: unknown
    api.respond('PUT', '/notification-settings', request => { payload = request.postDataJSON(); return { json: { data: api.data.categories } } })
    api.respond('PATCH', '/templates/t1', request => { payload = request.postDataJSON(); return { json: { data: { ...api.data.template, active: false } } } })
    const path = scenario === 'people' ? '/people' : scenario === 'notifications' ? '/settings/notifications' : '/templates/t1'
    for (const text of [100, 200]) for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      if (text === 200) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await settleLayout(page)
      await expect(page.locator('html')).toHaveCSS('font-size', text === 200 ? '32px' : '16px')
      const locator = scenario === 'people' ? page.locator('.person-item strong')
        : scenario === 'notifications' ? page.locator('.notification-settings label, .notification-settings h2')
          : page.locator('.template-page .ui-form-grid h2, [data-test=toggle-active]')
      const textTarget = scenario === 'people' ? page.locator('.person-item strong').first() : scenario === 'notifications' ? page.locator('.notification-settings label').first() : page.locator('[data-test=toggle-active]')
      await expect(textTarget).toHaveCSS('font-size', text === 200 ? '32px' : '16px')
      await record(page, info, width + '-text-' + text, await words(locator, scenario === 'people' ? 10 : null))
      if (scenario === 'people') {
        const photo = page.locator('.person-item').first().locator('img')
        await expect(photo).toBeVisible()
        expect(await photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
        await expect(page.locator('.person-item strong').first()).toHaveText(api.data.person.full_name)
        if (width === 320) {
          const row = page.locator('.person-item').nth(1)
          const photoBox = (await row.locator('img').boundingBox())!
          const nameBox = (await row.locator('strong').boundingBox())!
          if (text === 100) {
            expect(nameBox.x, 'ordinary text keeps the compact photo/name row').toBeGreaterThanOrEqual(photoBox.x + photoBox.width)
            expect(nameBox.y).toBeLessThan(photoBox.y + photoBox.height)
          } else {
            expect(nameBox.y, 'enlarged text receives the full row below the photo').toBeGreaterThanOrEqual(photoBox.y + photoBox.height)
            expect(nameBox.x).toBeLessThanOrEqual(photoBox.x + 1)
          }
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 390 })
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await settleLayout(page)
    if (scenario === 'people') {
      const action = page.locator('.person-item__open').first()
      await focusAction(page, action, info, 'short')
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/people\/p1$/)
      await expect(page.locator('.person-card h1')).toHaveText(api.data.person.full_name)
    } else if (scenario === 'notifications') {
      const action = page.locator('label').filter({ has: page.locator('[data-test=category-reminders]') })
      const checkbox = action.locator('input')
      await focusAction(page, action, info, 'short', checkbox)
      await page.keyboard.press('Space')
      await expect(checkbox).toBeChecked()
      await expect.poll(() => payload).toEqual({ settings: { reminders: true } })
    } else {
      const action = page.locator('[data-test=toggle-active]')
      await focusAction(page, action, info, 'short')
      await page.keyboard.press('Enter')
      await expect.poll(() => payload).toEqual({ active: false })
      await expect(page.getByText('Автоматическое создание событий выключено.', { exact: true })).toBeVisible()
    }
    expect(api.unhandled).toEqual([])
  })
}

for (const theme of ['dark', 'light']) {
  test(theme + ': enlarged readable phone calendar', async ({ page }, info) => {
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    const api = await installAcceptanceApi(page)
    let rotations = 0
    api.respond('POST', '/me/ical-token/rotate', () => { rotations++; return { json: { data: { ical_url: 'https://church.example.test/new.ics' } } } })
    for (const text of [100, 200]) for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/settings/ical')
      await expect(page.locator('main h1')).toBeVisible()
      if (text === 200) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await settleLayout(page)
      await expect(page.locator('[data-test=rotate]')).toHaveCSS('font-size', text === 200 ? '32px' : '16px')
      await record(page, info, width + '-text-' + text, await words(page.locator('.ical-settings .ui-form-section h2, [data-test=copy], [data-test=rotate]'), null))
      await page.locator('[data-test=rotate]').click()
      const dialog = page.getByRole('dialog', { name: 'Перевыпуск ссылки календаря' })
      await expect(dialog).toBeVisible()
      const measured = await words(dialog.locator('h2, button'), null)
      await writeFile(info.outputPath(width + '-text-' + text + '-dialog.json'), JSON.stringify(measured, null, 2))
      await page.screenshot({ path: info.outputPath(width + '-text-' + text + '-dialog.png') })
      for (const item of measured) expect.soft(item.broken, item.text).toEqual([])
      await dialog.getByRole('button', { name: 'Назад', exact: true }).click()
      await expect(dialog).not.toBeVisible()
    }
    await page.setViewportSize({ width: 320, height: 390 })
    await page.goto('/settings/ical')
    await expect(page.locator('main h1')).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await settleLayout(page)
    const trigger = page.locator('[data-test=rotate]')
    await focusAction(page, trigger, info, 'short-trigger')
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Перевыпуск ссылки календаря' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Старая ссылка перестанет работать.')
    const cancel = dialog.getByRole('button', { name: 'Назад', exact: true })
    await focusAction(page, cancel, info, 'short-dialog')
    await page.keyboard.press('Enter')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    expect(rotations, 'opening and canceling never rotates the token').toBe(0)
    expect(api.unhandled).toEqual([])
  })
}
