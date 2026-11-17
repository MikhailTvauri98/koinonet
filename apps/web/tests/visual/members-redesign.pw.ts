import { expect, test, type Page } from '@playwright/test'
import { expectControlInViewport } from './support/acceptance-layout'
import { mockVisualApi } from './support/api'

const ministry = { id: 'm-members', name: 'Музыкальное служение', description: 'Готовимся к событиям и служим вместе', cover_url: null, color: null as string | null, members_count: 100, default_role_id: 'r-member', chat_id: 'c-members', archived_at: null }
const roles = [{ id: 'r-member', name: 'Участник' }, { id: 'r-tech', name: 'Звукорежиссёр и координатор технической команды служения' }]
const longName = 'Константинопольский-Рождественский Александр Александрович'
const members = Array.from({ length: 100 }, (_, index) => ({
  id: `mem-${index}`, ministry_id: ministry.id, person_id: `p-${index}`, joined_at: '2026-10-01T10:00:00Z',
  full_name: index === 99 ? null : index === 1 ? longName : `Участник ${index + 1}`,
  photo_url: index === 0 ? '/members-photo.jpg' : null,
  roles: index < 2 ? roles : [roles[0]!],
}))
const day = 86_400_000
const upcoming = (index: number, over: Record<string, unknown> = {}) => ({
  id: `ev-${index}`, chat_id: null, owner_type: 'ministry', ministry: { id: ministry.id, name: ministry.name, color: null }, template_id: null, occurrence_date: null,
  title: index === 0 ? 'Репетиция перед воскресным служением с очень длинным названием для проверки переноса' : `Событие ${index + 1}`, description: '', location: null,
  starts_at: new Date(Date.now() + (index + 1) * day).toISOString(), ends_at: new Date(Date.now() + (index + 1) * day + 7_200_000).toISOString(),
  visibility: 'church', status: 'scheduled', cancelled_at: null, cancel_reason: null, can_manage: index === 0, attachments: [],
  slots: index === 0 ? [{ id: 's1', label: 'Вокал', resource_type: 'person', role: null, required_count: 3, filled_count: 1, sort_order: 0, can_fill: true, assignments: [] }] : [], ...over,
})
async function fixtures(page: Page, empty = false) {
  // Копия на тест: правка служения (PATCH) не протекает в другие тесты.
  const current = { ...ministry }
  await mockVisualApi(page)
  await page.route('**/members-photo.jpg', route => route.fulfill({ path: 'tests/visual/fixtures/photo-portrait.jpg', contentType: 'image/jpeg' }))
  await page.route('**/api/v1/events**', route => route.fulfill({ json: { data: empty ? [] : [0, 1, 2, 3].map(index => upcoming(index)), meta: { current_page: 1, last_page: 1, total: 4 } } }))
  await page.route('**/api/v1/announcements**', route => route.fulfill({ json: { data: empty ? [] : [{
    id: 'an-1', scope: 'ministry', ministry: { id: ministry.id, name: ministry.name, color: null }, author: null, title: 'Сбор на репетицию в субботу',
    body: '**Приходим** к десяти утра, берём [ноты](https://example.test) и воду. Вторая строка текста объявления, чтобы проверить обрезку. Третья строка не должна быть видна на экране.',
    pinned: false, hide_after: null, notify_on_publish: false, published_at: new Date(Date.now() - day).toISOString(), archived: false, attachments: [],
  }], meta: { current_page: 1, last_page: 1, total: 1 } } }))
  await page.route('**/api/v1/ministries**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (path === '/ministries') await route.fulfill({ json: { data: [current] } })
    else if (path === `/ministries/${ministry.id}`) {
      if (route.request().method() === 'PATCH') Object.assign(current, route.request().postDataJSON())
      await route.fulfill({ json: { data: current } })
    }
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
      const item = page.locator('.ministries-page__item')
      await expect(page.getByRole('link', { name: ministry.name, exact: true })).toHaveCount(1)
      await expect(item.locator('[data-test=ministry-tile]')).toHaveText('М')
      await expect(item).toContainText('100 участников')
      await fits(page)
      await page.screenshot({ path: info.outputPath(`ministries-${theme}-${width}.png`), fullPage: true })
      await item.click()
      // Заголовок страницы — название служения; плитка нейтрального цвета и подсказка управляющему.
      await expect(page.getByRole('heading', { level: 1, name: ministry.name, exact: true })).toBeVisible()
      await expect(page.getByText(ministry.description, { exact: true })).toBeVisible()
      await expect(page.locator('.ministry-header [data-test=members-count]')).toHaveText('100 участников')
      await expect(page.getByRole('button', { name: 'Выберите цвет служения', exact: true })).toBeVisible()
      // Сводка: три ближайших события, пометка мест, состав с распределением по ролям, объявление, чат; служебных блоков на экране нет.
      await expect(page.getByRole('heading', { level: 2, name: 'Ближайшие события', exact: true })).toBeVisible()
      await expect(page.locator('[data-test=overview-event]')).toHaveCount(3)
      await expect(page.locator('[data-test=overview-places-ev-0]')).toHaveText('2 места')
      await expect(page.locator('[data-test=overview-places-ev-1]')).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 2, name: 'Состав', exact: true })).toBeVisible()
      await expect(page.locator('[data-test=composition-member]')).toHaveCount(12)
      await expect(page.locator('[data-test=composition-roles]')).toHaveText(`${roles[1]!.name} 2`)
      await expect(page.locator('[data-test=announcement-preview]')).toContainText('Приходим к десяти утра, берём ноты и воду.')
      // Заголовок-ссылка в списке без подчёркивания (спецификация фазы 8, «Рамки и поверхности»).
      expect(await page.locator('.latest-announcement h3 a').evaluate(element => getComputedStyle(element).textDecorationLine)).toBe('none')
      await expect(page.getByRole('link', { name: 'Перейти в чат', exact: true })).toBeVisible()
      for (const hidden of ['Изменить название и описание', 'Обложка', 'Архивировать']) await expect(page.getByRole('button', { name: hidden, exact: true })).toHaveCount(0)
      for (const link of await page.locator('.overview-grid a').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      const columns = await page.locator('.overview-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      expect(columns).toBe(width >= 768 ? 2 : 1)
      await fits(page)
      await page.screenshot({ path: info.outputPath(`ministry-overview-${theme}-${width}.png`), fullPage: true })
      const menu = page.getByRole('button', { name: 'Действия со служением', exact: true })
      await menu.click()
      const actions = page.getByRole('dialog', { name: 'Действия со служением' })
      for (const action of ['Изменить название и описание', 'Обложка', 'Цвет', 'Архивировать']) await expect(actions.getByRole('button', { name: action, exact: true })).toBeVisible()
      await fits(page)
      await page.screenshot({ path: info.outputPath(`ministry-menu-${theme}-${width}.png`), fullPage: true })
      await actions.getByRole('button', { name: 'Изменить название и описание', exact: true }).click()
      await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeFocused()
      await fits(page)
      await page.screenshot({ path: info.outputPath(`ministry-edit-${theme}-${width}.png`), fullPage: true })
      await page.getByRole('button', { name: 'Отмена', exact: true }).click()
      await expect(menu).toBeFocused()
      // Цвет: без предвыбора, ошибка у поля, выбор по стрелкам, сохранение меняет плитку.
      await page.getByRole('button', { name: 'Выберите цвет служения', exact: true }).click()
      const colors = page.getByRole('radiogroup', { name: 'Цвет служения' })
      await expect(colors.getByRole('radio')).toHaveCount(6)
      for (const radio of await colors.getByRole('radio').all()) {
        await expect(radio).not.toBeChecked()
        const box = (await radio.locator('xpath=..').boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      for (const label of ['Фиолетовый', 'Бирюзовый', 'Розовый', 'Янтарный', 'Голубой', 'Зелёный']) await expect(colors.getByText(label, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await expect(colors.getByText('Выберите цвет', { exact: true })).toBeVisible()
      await expect(colors).toHaveAccessibleDescription('Выберите цвет')
      await fits(page)
      await page.screenshot({ path: info.outputPath(`ministry-color-error-${theme}-${width}.png`), fullPage: true })
      await colors.getByRole('radio', { name: 'Бирюзовый', exact: true }).focus()
      await page.keyboard.press('ArrowRight')
      await expect(colors.getByRole('radio', { name: 'Розовый', exact: true })).toBeChecked()
      await page.screenshot({ path: info.outputPath(`ministry-color-chosen-${theme}-${width}.png`), fullPage: true })
      const saved = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith(`/ministries/${ministry.id}`))
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      expect((await saved).postDataJSON()).toEqual({ color: 'rose' })
      await expect(page.locator('.ministry-header [data-test=ministry-tile]')).toHaveAttribute('style', /--ui-ministry-rose/)
      await expect(page.getByRole('button', { name: 'Выберите цвет служения', exact: true })).toHaveCount(0)
      await page.screenshot({ path: info.outputPath(`ministry-colored-${theme}-${width}.png`), fullPage: true })
    })
  }
  test(`ministry overview at 320px with 200% text ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 480 })
    await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
    await fixtures(page)
    await page.goto(`/ministries/${ministry.id}`)
    await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important } html { font-size: 32px !important; }' })
    await expect(page.locator('[data-test=overview-event]')).toHaveCount(3)
    await expect(page.locator('[data-test=composition-member]')).toHaveCount(12)
    await expect(page.getByRole('link', { name: 'Перейти в чат', exact: true })).toBeVisible()
    await fits(page)
    await page.screenshot({ path: info.outputPath(`ministry-overview-200-${theme}-320.png`), fullPage: true })
  })
  for (const [width, height, scale] of [[390, 844, 1], [1440, 900, 1], [320, 480, 2]] as const) {
    test(`compact members and details ${theme} ${width}px ${scale * 100}%`, async ({ page }, info) => {
      await page.setViewportSize({ width, height })
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await fixtures(page)
      await page.goto(`/ministries/${ministry.id}/members`)
      await expect(page.getByRole('heading', { level: 1, name: ministry.name, exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Участники', exact: true })).toHaveAttribute('aria-current', 'page')
      await page.addStyleTag({ content: `nuxt-devtools-frame { display: none !important } html { font-size: ${16 * scale}px !important; }` })
      await expect(page.locator('[data-test=member-row]')).toHaveCount(100)
      await expect(page.locator('[data-test=member-row] input')).toHaveCount(0)
      // Роль по умолчанию скрыта, пока есть другие; единственная показана.
      await expect(page.locator('[data-test=member-row] .member-row__roles').first()).toHaveText(roles[1]!.name)
      await expect(page.locator('[data-test=member-row] .member-row__roles').nth(2)).toHaveText('Участник')
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
  await expectControlInViewport(page, name)
  await fits(page)
  await page.screenshot({ path: info.outputPath('ministry-invalid-320-200.png') })
  await expect(page.getByRole('radiogroup', { name: 'Цвет служения' })).toHaveAccessibleDescription('Выберите цвет')
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(create).toBeFocused()
  await page.locator('.ministries-page__item').click()
  const menu = page.getByRole('button', { name: 'Действия со служением', exact: true })
  await menu.click()
  await page.getByRole('button', { name: 'Изменить название и описание', exact: true }).click()
  const editName = page.getByRole('textbox', { name: 'Название', exact: true })
  await expect(editName).toBeFocused()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(menu).toBeFocused()
})

test('creating a ministry requires a colour and sends the chosen one', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixtures(page)
  await page.goto('/ministries')
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important }' })
  await page.getByRole('button', { name: 'Создать служение', exact: true }).click()
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Молодёжное')
  let posted: unknown
  await page.route('**/api/v1/ministries', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    posted = route.request().postDataJSON()
    return route.fulfill({ status: 201, json: { data: { ...ministry, id: 'm-new', name: 'Молодёжное', color: 'sky' } } })
  })
  await page.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: 'Цвет служения' }).getByText('Выберите цвет', { exact: true })).toBeVisible()
  expect(posted).toBeUndefined()
  await fits(page)
  await page.screenshot({ path: info.outputPath('ministry-create-color-required.png'), fullPage: true })
  await page.getByRole('radio', { name: 'Голубой', exact: true }).check({ force: true })
  await expect(page.getByText('Выберите цвет', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Служение «Молодёжное» создано' })).toBeVisible()
  expect(posted).toEqual({ name: 'Молодёжное', description: null, color: 'sky' })
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
