import { expect, test } from '@playwright/test'
import { mockVisualApi } from './support/api'
for (const width of [320, 390, 767, 768, 1024, 1440, 1920]) {
  for (const scale of [1, 2]) {
    test(`navigation fits ${width} at ${scale * 100}% text`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 700 }); await mockVisualApi(page); await page.goto('/')
      if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
      await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
      const nav = page.getByRole('navigation', { name: 'Основная навигация', exact: true })
      if (width < 768) {
        await expect(nav.getByRole('link')).toHaveCount(4)
        await expect(nav.getByRole('button', { name: 'Ещё', exact: true })).toBeVisible()
        for (const label of ['Главная', 'Календарь', 'Чаты', 'Уведомления', 'Ещё']) {
          const item = nav.getByRole(label === 'Ещё' ? 'button' : 'link', { name: label, exact: true })
          const bounds = await item.boundingBox()
          expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44)
          // Complete words stay readable, without letter-by-letter wrapping.
          expect(await item.locator('[data-nav-label]').evaluate(el => {
            const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length
          })).toBe(1)
        }
        await expect.poll(async () => {
          const box = (await nav.boundingBox())!
          return page.locator('main').evaluate((el, height) => parseFloat(getComputedStyle(el).paddingBottom) >= height, box.height)
        }).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`navigation-${width}-${scale}.png`), fullPage: false })
        await nav.getByRole('button', { name: 'Ещё', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Ещё', exact: true })
        await expect(dialog.getByRole('link')).toHaveCount(9)
        expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`more-${width}-${scale}.png`) })
      } else {
        await expect(nav.getByRole('link')).toHaveCount(13)
        await expect(nav.getByRole('button', { name: 'Ещё', exact: true })).toBeHidden()
        await page.screenshot({ path: testInfo.outputPath('navigation-desktop-' + width + '-' + scale + '.png') })
      }
      expect(await nav.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    })
  }
}
test('More traps Tab, restores focus on Escape and closes on selection', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 }); await mockVisualApi(page); await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Ещё', exact: true }); await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Ещё', exact: true })
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i < 6 ? 'Shift+Tab' : 'Tab')
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
  await trigger.click(); await dialog.getByRole('link', { name: 'Люди', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(page).toHaveURL('/people'); await expect(trigger).toHaveClass(/app-nav__item--active/)
})

for (const [name, permissions, links] of [
  ['no permissions', { administrator: false, global: [], ministries: {} }, ['Объявления', 'Профиль', 'Календарь телефона']],
  ['one ministry', { administrator: false, global: [], ministries: { m1: ['events.manage'] } }, ['Служения', 'Шаблоны', 'Объявления', 'Профиль', 'Календарь телефона']],
] as const) {
  test('More exposes only allowed sections: ' + name, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 600 })
    await mockVisualApi(page)
    await page.route('**/api/v1/auth/me', route => route.fulfill({ json: {
      user: { id: 'u-visual', email: 'visual@example.test', phone: null, ical_url: 'https://example.test/calendar.ics' },
      person: { id: 'p-visual', first_name: 'Анна', last_name: 'Петрова', patronymic: null, status: 'member' },
      permissions,
    } }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Ещё', exact: true }).getByRole('link')).toHaveText([...links])
  })
}

test('resizing a phone with More open closes it on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 600 })
  await mockVisualApi(page); await page.goto('/')
  await page.getByRole('button', { name: 'Ещё', exact: true }).click()
  await page.setViewportSize({ width: 1024, height: 600 })
  await expect(page.getByRole('dialog', { name: 'Ещё', exact: true })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link')).toHaveCount(13)
  await expect(page.getByRole('button', { name: 'Ещё', exact: true })).toBeHidden()
  await expect(page.locator('#main-content')).toBeVisible()
  await expect(page.locator('#main-content')).toBeFocused()
})

for (const scale of [1, 2]) {
  test('unread counts stay readable and do not cover labels at text ' + scale * 100, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 600 }); await mockVisualApi(page)
    await page.route('**/api/v1/chats', route => route.fulfill({ json: { data: [], meta: { unread_total: 12345 } } }))
    await page.route('**/api/v1/notifications', route => route.fulfill({ json: { data: [], meta: { unread_count: 987 }, next_cursor: null } }))
    await page.goto('/')
    if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
    await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
    for (const [id, count] of [['chat-badge', '12345'], ['notification-badge', '987']]) {
      const badge = page.locator('[data-test="' + id + '"]')
      await expect(badge).toHaveText(count!)
      expect(await badge.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12 * scale)
      const box = (await badge.boundingBox())!
      const label = (await badge.locator('..').locator('[data-nav-label]').boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(label.y)
    }
    await page.screenshot({ path: testInfo.outputPath('badges-' + scale + '.png') })
  })
}

test('layout reserves extra bottom inset after the navigation grows', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 }); await mockVisualApi(page); await page.goto('/')
  await expect(page.getByRole('button', { name: 'Ещё', exact: true })).toBeVisible()
  await page.addStyleTag({ content: '.app-nav { padding-bottom: 28px !important; }' })
  await expect.poll(async () => {
    const height = (await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox())!.height
    return page.locator('main').evaluate((el, h) => parseFloat(getComputedStyle(el).paddingBottom) >= h, height)
  }).toBe(true)
})

for (const width of [320, 768]) {
  test('shared shell keeps useful reading width at ' + width + ' and 200% text', async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 }); await mockVisualApi(page)
    await page.route('**/api/v1/me/profile', route => route.fulfill({ json: { data: { photo_url: null, contacts: { phone: null, email: null, birth_date: null }, contacts_public: false } } }))
    await page.goto('/settings/profile')
    await page.addStyleTag({ content: 'html { font-size: 32px !important; } nuxt-devtools-frame { display: none !important; }' })
    const save = page.getByRole('button', { name: 'Сохранить', exact: true })
    await expect(save).toBeVisible()
    const available = await page.locator('.app-layout__inner').evaluate(el => {
      const style = getComputedStyle(el)
      return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    })
    expect(available).toBeGreaterThanOrEqual(width === 320 ? 250 : 360)
    expect(await save.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length
    })).toBe(1)
    if (width === 768) {
      const nav = page.getByRole('navigation', { name: 'Основная навигация' })
      expect((await nav.boundingBox())!.width).toBeLessThanOrEqual(280)
      expect(await nav.getByRole('link', { name: 'Уведомления', exact: true }).locator('[data-nav-label]').evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length
      })).toBe(1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await save.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('shell-readable-' + width + '-200.png') })
  })
}
