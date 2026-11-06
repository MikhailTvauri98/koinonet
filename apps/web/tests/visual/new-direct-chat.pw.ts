import { expect, test } from '@playwright/test'
import { mockVisualApi } from './support/api'

const people = [
  { id: 'p-direct', first_name: 'Александр', last_name: 'Константинопольский-Рождественский', patronymic: 'Александрович', full_name: 'Константинопольский-Рождественский Александр Александрович', photo_url: null, status: 'member', archived: false, has_account: true, user_id: 'account-direct', account_disabled: false, has_global_roles: true },
  { id: 'p-second', first_name: 'Мария', last_name: 'Соколова', patronymic: null, full_name: 'Соколова Мария', photo_url: null, status: 'member', archived: false, has_account: true, user_id: 'account-second', account_disabled: false, has_global_roles: true },
]
for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, scale] of [[390, 844, 1], [1440, 900, 1], [320, 480, 2], [375, 390, 1]] as const) {
    test(`new direct message ${theme} ${width} ${height} ${scale * 100}%`, async ({ page }, info) => {
      await page.setViewportSize({ width, height })
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await mockVisualApi(page)
      await page.route('**/api/v1/people**', route => route.fulfill({ json: { data: people, meta: { last_page: 1 } } }))
      await page.goto('/chats')
      await page.addStyleTag({ content: `html { font-size: ${16 * scale}px !important } nuxt-devtools-frame { display: none !important }` })
      const opener = page.getByRole('button', { name: 'Новое сообщение', exact: true })
      await expect(opener).toBeVisible()
      if (scale === 1 && height > 600) await page.screenshot({ path: info.outputPath(`chat-list-${theme}-${width}.png`), fullPage: true })
      await opener.click()
      const dialog = page.getByRole('dialog', { name: 'Новое сообщение', exact: true })
      await expect(dialog.getByRole('searchbox')).toBeFocused()
      await expect(dialog.getByRole('button', { name: people[0]!.full_name, exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      const geometry = await dialog.evaluate(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, scroll: element.scrollWidth, width: element.clientWidth }))
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(width)
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
      await page.screenshot({ path: info.outputPath(`direct-dialog-${theme}-${width}-${height}-${scale}.png`), fullPage: true })
      if (scale === 2 || height < 500) {
        const list = dialog.locator('.people-picker__list')
        expect(await list.evaluate(element => getComputedStyle(element).overflowY)).toBe('visible')
        await dialog.evaluate(element => { element.scrollTop = 0 })
        await page.screenshot({ path: info.outputPath(`direct-top-${theme}-${width}.png`) })
        const candidate = dialog.getByRole('button', { name: people[0]!.full_name, exact: true })
        await candidate.focus(); await candidate.scrollIntoViewIfNeeded()
        await expect(candidate).toBeInViewport()
        expect(await candidate.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        await page.screenshot({ path: info.outputPath(`direct-candidate-${theme}-${width}.png`) })
        await dialog.getByRole('button', { name: 'Отмена', exact: true }).focus()
        await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeInViewport()
        await page.screenshot({ path: info.outputPath(`direct-actions-${theme}-${width}.png`) })
      }
      await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
      await expect(opener).toBeFocused()
    })
  }
}

test('pending direct write blocks duplicate selection and Escape, then preserves choice on error', async ({ page }, info) => {
  await mockVisualApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/people**', route => route.fulfill({ json: { data: people, meta: { last_page: 1 } } }))
  let release!: () => void, writes = 0
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/chats', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    writes++; await held; await route.fulfill({ status: 500, json: { message: 'Не удалось открыть личный чат. Попробуйте ещё раз.' } })
  })
  await page.goto('/chats')
  await page.getByRole('button', { name: 'Новое сообщение', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Новое сообщение', exact: true })
  await dialog.getByRole('button', { name: people[0]!.full_name, exact: true }).click()
  await expect(dialog.getByRole('searchbox')).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible()
  release()
  await expect(dialog.getByRole('alert')).toContainText('Не удалось открыть личный чат')
  await expect(dialog.getByRole('button', { name: people[0]!.full_name, exact: true })).toBeEnabled()
  expect(writes).toBe(1)
  await page.screenshot({ path: info.outputPath('direct-error-dark-390.png'), fullPage: true })
})

for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440]) {
    test(`person and member direct entrypoints ${theme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await mockVisualApi(page)
      const person = people[0]!
      await page.route('**/api/v1/people/p-direct', route => route.fulfill({ json: { data: { ...person, global_roles: [], ministries: [] } } }))
      await page.route('**/api/v1/ministries/m-direct**', route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/members')) return route.fulfill({ json: { data: [{ id: 'mem-direct', ministry_id: 'm-direct', person_id: person.id, joined_at: '', full_name: person.full_name, photo_url: null, roles: [{ id: 'r1', name: 'Участник' }] }] } })
        if (path.endsWith('/roles')) return route.fulfill({ json: { data: [{ id: 'r1', name: 'Участник' }] } })
        return route.fulfill({ json: { data: { id: 'm-direct', name: 'Музыкальное служение', archived_at: null, default_role_id: 'r1', chat_id: null, cover_url: null, description: '' } } })
      })
      await page.goto('/people/p-direct')
      await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important }' })
      await expect(page.getByRole('button', { name: 'Написать', exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`direct-person-${theme}-${width}.png`), fullPage: true })
      await page.goto('/ministries/m-direct/members')
      await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important }' })
      await page.locator('[data-test="open-member"]').click()
      const dialog = page.getByRole('dialog', { name: 'Участник служения' })
      await expect(dialog.getByRole('button', { name: 'Написать', exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`direct-member-${theme}-${width}.png`), fullPage: true })
    })
  }
}
