import { expect, test, type Page } from '@playwright/test'
import { mockVisualApi } from './support/api'
import { measureWordWrapping } from './support/word-wrapping'

async function sharedForms(page: Page) {
  await mockVisualApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Здравствуйте, Анна!' })).toBeVisible()
  const path = '/_nuxt/@fs/' + process.cwd().replaceAll('\\', '/') + '/tests/visual/support/shared-forms-harness.ts'
  await page.evaluate(async url => { (await import(/* @vite-ignore */ url)).mount() }, path)
  await expect(page.getByRole('heading', { name: 'Общие формы' })).toBeVisible()
  await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
}

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, scale] of [[390, 844, 1], [1440, 900, 1], [320, 390, 2]] as const) {
    test(`shared forms and actions ${theme} ${width}px text ${scale * 100}%`, async ({ page }, info) => {
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height })
      await sharedForms(page)
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: info.outputPath(`forms-${theme}-${width}.png`), fullPage: true })
      const trigger = page.getByRole('button', { name: 'Открыть окно', exact: true })
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Сохранение изменений', exact: true })
      await expect(dialog.getByLabel('Новый пароль')).toBeFocused()
      await expectContained(page)
      const bounds = (await dialog.boundingBox())!
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height)
      if (scale === 1) expect(bounds.height).toBeLessThan(440)
      const error = dialog.getByRole('alert')
      await expect(dialog.getByRole('textbox', { name: 'Новый пароль', exact: true })).toBeVisible()
      expect((await dialog.getByLabel('Новый пароль').getAttribute('aria-describedby'))?.split(' ')).toContain(await error.getAttribute('id'))
      const primary = dialog.getByRole('button', { name: 'Сохранить', exact: true })
      await expect(primary).toHaveCSS('color', theme === 'dark' ? 'rgb(20, 33, 59)' : 'rgb(255, 255, 255)')
      const secondary = dialog.getByRole('button', { name: 'Назад', exact: true })
      const danger = dialog.getByRole('button', { name: 'Отменить изменения', exact: true })
      expect(await danger.evaluate(el => getComputedStyle(el).color)).not.toBe(await secondary.evaluate(el => getComputedStyle(el).color))
      expect(await primary.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await secondary.evaluate(el => getComputedStyle(el).backgroundColor))
      if (scale === 2) {
        await dialog.evaluate(el => { el.scrollTop = 0 })
        await page.screenshot({ path: info.outputPath(`dialog-top-${theme}-${width}.png`) })
      }
      await dialog.getByRole('button', { name: 'Закрыть окно', exact: true }).focus()
      await page.keyboard.press('Shift+Tab')
      await expect(primary).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Закрыть окно', exact: true })).toBeFocused()
      await dialog.getByLabel('Новый пароль').fill('A-long-password-123')
      await primary.scrollIntoViewIfNeeded()
      await expect(primary).toBeInViewport()
      await page.screenshot({ path: info.outputPath(`dialog-${theme}-${width}.png`) })
      await primary.click()
      await expect(dialog.getByRole('status')).toContainText('Изменения сохранены')
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
    })
  }
}

test('form sections respond to their container rather than a wide viewport and preserve native choices', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await sharedForms(page)
  const grid = page.locator('[data-test="form-grid"]')
  for (const [width, columns] of [[679, 1], [680, 2], [900, 2], [500, 1]] as const) {
    await grid.evaluate((el, value) => { (el as HTMLElement).style.width = value + 'px' }, width)
    const sections = grid.locator('.ui-form-section')
    const first = (await sections.nth(0).boundingBox())!, second = (await sections.nth(1).boundingBox())!
    expect(Math.abs(first.y - second.y) < 1, `container ${width}px`).toBe(columns === 2)
    expect(await grid.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  await page.getByLabel('Кто видит событие').selectOption('Только назначенные')
  await expect(page.getByLabel('Кто видит событие')).toHaveValue('Только назначенные')
  await page.getByLabel('Без уведомления', { exact: true }).check()
  await expect(page.getByLabel('Уведомить всех о новом событии')).not.toBeChecked()
})

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

for (const theme of ['dark', 'light'] as const) {
for (const width of [320, 390, 1440]) {
  for (const scale of [1, 2]) {
    test(theme + ' iCal confirmation fits ' + width + ' at text ' + scale * 100 + '% and reports failure', async ({ page }, testInfo) => {
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
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
      await page.screenshot({ path: testInfo.outputPath('ical-' + theme + '-' + width + '-' + scale + '.png') })
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
    })
  }
}
}

for (const theme of ['dark', 'light'] as const) {
  test(`${theme} existing More menu keeps its compact header spacing`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
    await page.setViewportSize({ width: 390, height: 844 })
    await mockVisualApi(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Ещё', exact: true })
    await expect(dialog).toBeVisible()
    const header = (await dialog.locator('header').boundingBox())!
    const links = (await dialog.locator('.more-menu__links').first().boundingBox())!
    expect(links.y - header.y - header.height).toBeLessThanOrEqual(16)
    await expectContained(page)
    await page.screenshot({ path: info.outputPath(`more-${theme}-390.png`) })
  })
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

// Task 9: actual production dialogs with permitted Directory responses.
for (const mode of ['people', 'accounts'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    for (const [width, height, scale] of [[390, 844, 1], [1440, 900, 1], [320, 390, 2]] as const) {
      test(`people picker ${mode} ${theme} ${width}px text ${scale * 100}%`, async ({ page }, info) => {
        await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
        await page.setViewportSize({ width, height })
        await mockVisualApi(page)
        const queries: URLSearchParams[] = []
        const person = (id: string, over = {}) => ({ id, first_name: 'Александра', last_name: 'Константинопольская', patronymic: 'Александровна', full_name: 'Константинопольская Александра Александровна', status: 'member', archived: false, photo_url: null, has_account: true, user_id: 'account-' + id, has_global_roles: true, account_disabled: false, ...over })
        await page.route('**/api/v1/people?*', route => {
          const query = new URL(route.request().url()).searchParams
          queries.push(query)
          const data = query.get('page') === '2'
            ? [person('photo', { photo_url: '/picker-photo.jpg' }), person('later', { full_name: 'Иванова Елена' })]
            : [person('photo', { photo_url: '/picker-photo.jpg' }), person('initials', { full_name: 'Смирнов Михаил' }), person('disabled', { account_disabled: true }), person('archived', { archived: true })]
          return route.fulfill({ json: { data, meta: { current_page: Number(query.get('page')), last_page: 2, total: 5 } } })
        })
        await page.route('**/picker-photo.jpg', route => route.fulfill({ path: 'tests/visual/fixtures/photo-portrait.jpg', contentType: 'image/jpeg' }))
        await page.route('**/api/v1/ministries/m1', route => route.fulfill({ json: { data: { id: 'm1', name: 'Музыкальное служение', archived_at: null, chat_id: null, cover_url: null, default_role_id: 'r1' } } }))
        await page.route('**/api/v1/ministries/m1/members', route => route.fulfill(route.request().method() === 'POST'
          ? { status: 503, json: {} } : { json: { data: [] } }))
        await page.goto(mode === 'accounts' ? '/chats' : '/ministries/m1/members')
        if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
        const trigger = page.getByRole('button', { name: mode === 'accounts' ? 'Новая группа' : 'Добавить участника', exact: true })
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: mode === 'accounts' ? 'Новая группа' : 'Добавить участника', exact: true })
        await expect(dialog.locator('[data-test="option-photo"]')).toBeVisible()
        expect(queries[0]!.has('search')).toBe(false)
        expect(queries[0]!.get('per_page')).toBe('20')
        expect(queries[0]!.get('has_account')).toBe(mode === 'accounts' ? '1' : null)
        await expect(dialog.locator('[data-test="option-photo"] img')).toBeVisible()
        await expect(dialog.locator('[data-test="option-initials"] .people-picker__avatar')).toHaveText('СМ')
        await expect(dialog.locator('[data-test="option-archived"]')).toHaveCount(0)
        if (mode === 'accounts') await expect(dialog.locator('[data-test="option-disabled"]')).toHaveCount(0)
        await expectContained(page)
        for (const control of await dialog.locator('input, button').all()) {
          const box = await control.boundingBox()
          if (box) expect(box.height).toBeGreaterThanOrEqual(44)
        }
        if (scale === 2) await expect(dialog.getByRole('searchbox')).toHaveCSS('font-size', '32px')
        if (scale === 2) {
          const list = await dialog.locator('.people-picker__list').evaluate(el => ({ content: el.scrollHeight, visible: el.clientHeight }))
          expect(list.content).toBeLessThanOrEqual(list.visible)
        }
        await dialog.evaluate(el => { el.scrollTop = 0 })
        await page.screenshot({ path: info.outputPath(`picker-${mode}-${theme}-${width}-preview.png`) })
        const option = dialog.locator('[data-test="option-photo"]')
        await option.focus()
        if (scale === 2) await option.evaluate(el => el.scrollIntoView({ block: 'start' }))
        if (scale === 2) await page.screenshot({ path: info.outputPath(`picker-${mode}-${theme}-${width}-rows.png`) })
        await page.keyboard.press('Enter')
        if (mode === 'accounts') {
          await expect(dialog.getByRole('list', { name: 'Выбранные участники' })).toContainText('Константинопольская Александра Александровна')
          await expect(option).toHaveCount(0)
          await dialog.getByLabel('Название', { exact: true }).fill('Подготовка общего выезда')
          await expect(dialog.locator('footer').getByRole('button', { name: 'Создать', exact: true })).toBeEnabled()
        } else {
          await expect(dialog.getByRole('alert')).toContainText('Не удалось добавить участника')
        }
        const more = dialog.getByRole('button', { name: 'Показать ещё', exact: true })
        await more.click()
        await expect(dialog.locator('[data-test="option-later"]')).toBeVisible()
        await expect(dialog.locator('[data-test="option-photo"]')).toHaveCount(mode === 'accounts' ? 0 : 1)
        await expectContained(page)
        const cancel = dialog.locator('footer').getByRole('button', { name: 'Отмена', exact: true })
        await cancel.scrollIntoViewIfNeeded(); await expect(cancel).toBeInViewport()
        await page.screenshot({ path: info.outputPath(`picker-${mode}-${theme}-${width}-actions.png`) })
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(trigger).toBeFocused()
      })
    }
  }
}

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height, scale] of [[390, 844, 1], [1440, 900, 1], [320, 390, 2], [375, 390, 2]] as const) {
    test(`chat information sound and composition ${theme} ${width}px text ${scale * 100}%`, async ({ page }, info) => {
      await page.addInitScript(value => localStorage.setItem('church.ui.theme', value), theme)
      await page.setViewportSize({ width, height })
      await mockVisualApi(page)
      const chat = { id: 'chat-info', title: 'Подготовка воскресного события и совместного обеда', type: 'group', avatar_url: null, archived: false, muted_until: null, members: [{ user_id: 'u-visual', full_name: 'Петрова Анна Сергеевна', is_owner: true }, { user_id: 'other', full_name: 'Константинопольская Александра Александровна', is_owner: false }, { user_id: 'hidden', full_name: null, is_owner: false }], pinned_messages: [], can_write: true, can_moderate: true, can_manage_members: true, is_owner: true }
      await page.route('**/api/v1/chats/chat-info', route => route.fulfill({ json: { data: chat } }))
      await page.route('**/api/v1/chats/chat-info/messages*', route => route.fulfill({ json: { data: [], next_before: null, next_after: null } }))
      await page.goto('/chats/chat-info')
      const composer = page.getByRole('textbox', { name: 'Сообщение', exact: true })
      await composer.fill('Сохранённый черновик')
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
      const trigger = page.getByRole('button', { name: 'Меню чата', exact: true })
      await trigger.focus(); await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: 'Сведения о чате', exact: true })
      await expect(dialog).toBeVisible()
      await expect(page.locator('dialog[open]')).toHaveCount(1)
      await expectContained(page)
      const rows = dialog.locator('.mute-menu__options button')
      await expect(rows).toHaveCount(4)
      let previousBottom = 0
      for (const row of await rows.all()) {
        const bounds = (await row.boundingBox())!
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        expect(bounds.y).toBeGreaterThanOrEqual(previousBottom)
        previousBottom = bounds.y + bounds.height
      }
      if (scale === 2) {
        const wrapping = await dialog.locator('.chat-info__actions button').evaluateAll(measureWordWrapping, null)
        expect(wrapping.flatMap(item => item.broken), 'fixed group action words stay whole').toEqual([])
      }
      await expect(dialog.locator('[data-test="unmute"]')).toHaveAttribute('aria-pressed', 'true')
      await dialog.evaluate(el => { el.scrollTop = 0 })
      await page.screenshot({ path: info.outputPath(`chat-info-${theme}-${width}.png`) })
      await dialog.locator('[data-test="mute-forever"]').scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath(`chat-sound-${theme}-${width}.png`) })
      await dialog.locator('[data-test="members"]').click()
      const members = page.getByRole('dialog', { name: 'Участники группы', exact: true })
      await expect(members).toBeVisible()
      await expect(dialog).toHaveCount(0)
      await expect(page.locator('dialog[open]')).toHaveCount(1)
      await expectContained(page)
      await expect(members).toContainText('Участник')
      await expect(members).toContainText('(владелец)')
      await members.evaluate(el => { el.scrollTop = 0 })
      await page.screenshot({ path: info.outputPath(`chat-members-${theme}-${width}.png`) })
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press(i < 4 ? 'Tab' : 'Shift+Tab')
        expect(await members.evaluate(el => el.contains(document.activeElement))).toBe(true)
      }
      await page.keyboard.press('Escape')
      await expect(members).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await expect(composer).toHaveValue('Сохранённый черновик')
      await page.keyboard.press('Enter')
      await dialog.locator('[data-test="rename"]').click()
      await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
    })
  }
}
