import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'

const ministry = { id: 'm-members', name: 'Музыкальное служение', description: 'Готовимся к событиям и служим вместе', cover_url: null, default_role_id: 'r-member', chat_id: null, archived_at: null }
const roles = [{ id: 'r-member', name: 'Участник' }, { id: 'r-tech', name: 'Звукорежиссёр и координатор технической команды служения' }]
const longName = 'Константинопольский-Рождественский Александр Александрович'
const members = Array.from({ length: 100 }, (_, index) => ({
  id: `mem-${index}`, ministry_id: ministry.id, person_id: `p-${index}`, joined_at: '2026-10-01T10:00:00Z',
  full_name: index === 99 ? null : index === 1 ? longName : `Участник ${index + 1}`,
  photo_url: index === 0 ? '/members-photo.jpg' : null,
  roles: index < 2 ? roles : [roles[0]!],
}))
async function fixtures(page: Page, empty = false) {
  await mockVisualApi(page)
  await page.route('**/members-photo.jpg', route => route.fulfill({ path: 'tests/visual/fixtures/photo-portrait.jpg', contentType: 'image/jpeg' }))
  await page.route('**/api/v1/ministries**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (path === '/ministries') await route.fulfill({ json: { data: [ministry] } })
    else if (path === `/ministries/${ministry.id}`) await route.fulfill({ json: { data: ministry } })
    else if (path === `/ministries/${ministry.id}/roles`) await route.fulfill({ json: { data: roles } })
    else if (path.endsWith('/members')) await route.fulfill({ json: { data: empty ? [] : members } })
    else if (path.endsWith('/roles') && route.request().method() === 'PUT') {
      const ids = route.request().postDataJSON().role_ids as string[]
      await route.fulfill({ json: { data: { ...members[0], roles: roles.filter(role => ids.includes(role.id)) } } })
    } else if (route.request().method() === 'DELETE') await route.fulfill({ status: 204 })
    else await route.fallback()
  })
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible()) {
    const geometry = await dialog.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, scroll: el.scrollWidth, width: el.clientWidth }))
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
  }
}
for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440]) {
    test(`ministry list and overview ${theme} ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await fixtures(page)
      await page.goto('/ministries')
      await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important }' })
      await expect(page.getByRole('heading', { name: 'Служения', exact: true })).toBeVisible()
      await fits(page)
      await page.screenshot({ path: info.outputPath(`ministries-${theme}-${width}.png`), fullPage: true })
      await page.locator('.ministries-page__item').click()
      await expect(page.getByRole('heading', { name: ministry.name, exact: true })).toBeVisible()
      await expect(page.getByText(ministry.description, { exact: true })).toBeVisible()
      await fits(page)
      await page.screenshot({ path: info.outputPath(`ministry-overview-${theme}-${width}.png`), fullPage: true })
      await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
      await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeFocused()
      await fits(page)
      await page.screenshot({ path: info.outputPath(`ministry-edit-${theme}-${width}.png`), fullPage: true })
    })
  }
  for (const [width, height, scale] of [[390, 844, 1], [1440, 900, 1], [320, 480, 2]] as const) {
    test(`compact members and details ${theme} ${width}px ${scale * 100}%`, async ({ page }, info) => {
      await page.setViewportSize({ width, height })
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await fixtures(page)
      await page.goto(`/ministries/${ministry.id}/members`)
      await expect(page.getByRole('heading', { name: 'Участники', exact: true })).toBeVisible()
      await page.addStyleTag({ content: `nuxt-devtools-frame { display: none !important } html { font-size: ${16 * scale}px !important; }` })
      await expect(page.locator('[data-test=member-row]')).toHaveCount(100)
      await expect(page.locator('[data-test=member-row] input')).toHaveCount(0)
      await expect(page.locator('[data-test=save-roles]')).toHaveCount(0)
      await fits(page)
      await page.screenshot({ path: info.outputPath(`members-${theme}-${width}.png`) })
      const search = page.getByRole('searchbox', { name: 'Найти участника' })
      await search.fill('Константинопольский')
      await expect(page.locator('[data-test=member-row]')).toHaveCount(1)
      await expect(page.locator('[data-test=member-row]')).toContainText(longName)
      await search.fill('Участник 1')
      const opener = page.locator('[data-test=open-member]').first()
      // A very long row may exceed the short viewport; click its visible name.
      await opener.locator('strong').click()
      const dialog = page.getByRole('dialog', { name: 'Участник служения' })
      const defaultRole = dialog.getByRole('checkbox', { name: 'Участник', exact: true })
      const techRole = dialog.getByRole('checkbox', { name: roles[1]!.name, exact: true })
      await expect(defaultRole).toBeChecked()
      await expect(techRole).toBeChecked()
      await fits(page)
      await dialog.evaluate(el => { el.scrollTop = 0 })
      await page.screenshot({ path: info.outputPath(`details-top-${theme}-${width}.png`) })
      await defaultRole.uncheck(); await techRole.uncheck()
      await dialog.getByRole('button', { name: 'Сохранить роли', exact: true }).click()
      await expect(dialog.getByRole('alert')).toContainText('Нельзя снять последнюю роль')
      await expect(defaultRole).toBeFocused()
      // The error remains a description, never part of a checkbox name.
      await expect(dialog.getByRole('checkbox', { name: 'Участник', exact: true })).toHaveCount(1)
      const field = (await defaultRole.boundingBox())!
      expect(field.y).toBeGreaterThanOrEqual(0)
      expect(field.y + field.height).toBeLessThan(height)
      await page.screenshot({ path: info.outputPath(`details-validation-${theme}-${width}.png`) })
      await defaultRole.check()
      await dialog.getByRole('button', { name: 'Сохранить роли', exact: true }).click()
      await expect(dialog.getByRole('status')).toContainText('Роли сохранены')
      await dialog.getByRole('button', { name: 'Исключить', exact: true }).click()
      await expect(dialog.getByRole('group', { name: 'Подтверждение исключения участника' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(opener).toBeFocused()
    })
  }
}

test('empty composition and server-masked identity stay explicit', async ({ page }, info) => {
  await fixtures(page, true)
  await page.goto(`/ministries/${ministry.id}/members`)
  await expect(page.getByText('В служении пока нет участников.', { exact: true })).toBeVisible()
  await expect(page.getByRole('searchbox')).toBeVisible()
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important }' })
  await page.screenshot({ path: info.outputPath('members-empty.png') })
  await fixtures(page)
  await page.reload()
  await page.getByRole('searchbox').fill('Имя скрыто')
  await expect(page.locator('[data-test=member-row]')).toHaveCount(0)
  await page.getByRole('searchbox').clear()
  const hidden = page.locator('[data-test=member-row]').last()
  await expect(hidden).toContainText('Имя скрыто')
  await expect(hidden.locator('img')).toHaveCount(0)
  await hidden.getByRole('button').click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Имя скрыто' })).toBeVisible()
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(0)
})

test('ministry form focuses invalid names above navigation and restores actual focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await fixtures(page)
  await page.goto('/ministries')
  await page.addStyleTag({ content: 'html { font-size: 32px !important } nuxt-devtools-frame { display: none !important }' })
  const create = page.getByRole('button', { name: 'Создать служение', exact: true })
  await create.click()
  const name = page.getByRole('textbox', { name: 'Название', exact: true })
  await expect(name).toBeFocused()
  await name.fill('  ')
  await page.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Заполните название')
  await expect(name).toBeFocused()
  const box = (await name.boundingBox())!
  const navigation = (await page.getByRole('navigation', { name: 'Основная навигация' }).last().boundingBox())
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThan(navigation?.y ?? 480)
  await fits(page)
  await page.screenshot({ path: info.outputPath('ministry-invalid-320-200.png') })
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(create).toBeFocused()
  await page.locator('.ministries-page__item').click()
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const editName = page.getByRole('textbox', { name: 'Название', exact: true })
  await expect(editName).toBeFocused()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toBeFocused()
})


test('pending role write blocks Escape until confirmed success without repeating the write', async ({ page }) => {
  await fixtures(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let writes = 0
  await page.route('**/api/v1/ministries/m-members/members/mem-0/roles', async (route) => {
    writes++
    await pending
    await route.fulfill({ json: { data: members[0] } })
  })
  await page.goto(`/ministries/${ministry.id}/members`)
  const opener = page.locator('[data-test=open-member]').first()
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Участник служения' })
  await dialog.getByRole('button', { name: 'Сохранить роли', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  release()
  await expect(dialog.getByRole('status')).toContainText('Роли сохранены')
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(opener).toBeFocused()
  expect(writes).toBe(1)
})
