import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { installAcceptanceApi } from './support/acceptance-api'
import { checkDocumentWidth, settleLayout, takeAcceptanceScreenshot } from './support/acceptance-layout'
import { measureWordWrapping } from './support/word-wrapping'

// A fixed chat-height subtraction or competing minimum height must expose an
// overlap here. Resizing a desktop viewport does not simulate a phone keyboard.
for (const path of ['/chats/c1', '/ministries/m1/chat']) {
  test('composer and latest message remain reachable: ' + path, async ({ page }, info) => {
    const api = await installAcceptanceApi(page)
    await page.setViewportSize({ width: 375, height: 844 })
    await page.goto(path)
    const composer = page.getByRole('textbox', { name: 'Сообщение', exact: true })
    await expect(composer).toBeVisible()
    // Baseline geometry uses decoded photos; a separate held-response test
    // below checks follow/reader behavior while real raster content arrives.
    await expect(page.locator('.message-list img')).toHaveCount(3)
    await expect.poll(() => page.locator('.message-list img').evaluateAll(elements => elements.every(element => (element as HTMLImageElement).naturalWidth > 0))).toBe(true)
    await settleLayout(page)
    await expect(page.locator('[data-test=latest-message]')).toBeInViewport()
    await composer.fill('Приду на репетицию.\nПомогу подготовить зал.')
    for (const size of [{ width: 375, height: 390 }, { width: 844, height: 390 }, { width: 375, height: 844 }]) {
      await page.setViewportSize(size)
      await settleLayout(page)
      const scrollEvidence = async (stage: string) => page.evaluate(label => ({ stage: label,
        elements: Object.fromEntries(['.app-layout__inner', '.message-list', '[data-test=latest-message]', '.composer'].map(selector => { const element = document.querySelector(selector)!; return [selector, { rect: element.getBoundingClientRect().toJSON(), scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }] })),
        images: Array.from(document.querySelectorAll('.message-list img'), element => ({ loaded: (element as HTMLImageElement).naturalWidth, rect: element.getBoundingClientRect().toJSON() })),
      }), stage)
      const scrollStates = [await scrollEvidence('after-resize')]
      await checkDocumentWidth(page)
      const send = page.getByRole('button', { name: 'Отправить', exact: true })
      await expect(send).toBeEnabled()
      await expect(page.locator('.chat-screen [role=alert]')).toHaveCount(0)
      // The accepted small-height fallback scrolls the shared outer surface.
      // Native keyboard focus must bring each composer control into reach.
      await composer.focus()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Прикрепить файл', exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(send).toBeFocused()
      await send.scrollIntoViewIfNeeded()
      scrollStates.push(await scrollEvidence('after-composer-focus'))
      await writeFile(info.outputPath(size.width + 'x' + size.height + '-scroll.json'), JSON.stringify(scrollStates, null, 2))
      await expect(send).toBeInViewport()
      const inputBox = await composer.boundingBox()
      const sendBox = await send.boundingBox()
      const navBox = await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox()
      expect.soft(inputBox!.y).toBeGreaterThanOrEqual(0)
      expect.soft(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(size.height)
      expect.soft(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(size.height)
      if (size.width < 768 && navBox) {
        expect.soft(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(navBox.y + 1)
        expect.soft(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(navBox.y + 1)
      }
      for (const block of ['.chat-screen__heading', '.composer']) {
        const natural = await page.locator(block).evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight }))
        expect.soft(natural.scroll, 'header/composer do not become tiny internal scrollers').toBeLessThanOrEqual(natural.client + 1)
      }
      await expect(page.locator('[data-test=latest-message]')).toBeInViewport()
      await takeAcceptanceScreenshot(page, info, size.width + 'x' + size.height)
    }
    await page.setViewportSize({ width: 375, height: 500 })
    await page.getByRole('button', { name: 'Меню чата', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Меню чата', exact: true })
    await expect(dialog).toBeVisible()
    await settleLayout(page)
    await checkDocumentWidth(page)
    await takeAcceptanceScreenshot(page, info, '375x500-menu')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Меню чата', exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Отправить', exact: true }).scrollIntoViewIfNeeded()
    const sendBox = await page.getByRole('button', { name: 'Отправить', exact: true }).boundingBox()
    const navBox = await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox()
    expect.soft(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(navBox!.y + 1)
    await page.setViewportSize({ width: 320, height: 844 })
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await settleLayout(page)
    const positions: unknown[] = []
    const capture = async (stage: string) => {
      positions.push(await page.evaluate((label) => ({
        stage: label, rootFont: getComputedStyle(document.documentElement).fontSize,
        outerScrollTop: document.querySelector('.app-layout__inner')!.scrollTop,
        rects: Object.fromEntries(['.chat-header', '.message-list', '.composer', '[data-test=send]', '.app-nav'].map(selector => [selector, document.querySelector(selector)?.getBoundingClientRect().toJSON()])),
      }), stage))
    }
    const menu = page.getByRole('button', { name: 'Меню чата', exact: true })
    const wrapping = await page.locator('.chat-header h1').evaluateAll(measureWordWrapping, null)
    const headingGeometry = await page.locator('.chat-header h1').evaluate(element => ({ width: element.getBoundingClientRect().width, font: getComputedStyle(element).fontSize }))
    const headingWords = { ...headingGeometry, broken: wrapping[0]!.broken }
    expect.soft(headingWords.broken, 'ordinary chat title words receive a readable column').toEqual([])
    expect.soft(parseFloat(headingWords.font), 'the chat title retains enlarged text').toBeGreaterThanOrEqual(36)
    const headingFile = info.outputPath('320-text-200-heading-words.json')
    await writeFile(headingFile, JSON.stringify(headingWords, null, 2))
    await menu.focus()
    await menu.scrollIntoViewIfNeeded()
    await expect(menu).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
    await capture('header-and-menu')
    await takeAcceptanceScreenshot(page, info, '320-text-200-header')
    const messageAction = page.locator('[data-test=actions-msg7]')
    await messageAction.focus()
    await messageAction.scrollIntoViewIfNeeded()
    await expect(messageAction).toBeInViewport()
    await expect(page.locator('[data-test=latest-message]')).toBeInViewport()
    await capture('history')
    await takeAcceptanceScreenshot(page, info, '320-text-200-history')
    await composer.focus()
    await composer.scrollIntoViewIfNeeded()
    await expect(composer).toBeInViewport()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Прикрепить файл', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    const enlargedSend = page.getByRole('button', { name: 'Отправить', exact: true })
    await expect(enlargedSend).toBeFocused()
    await enlargedSend.scrollIntoViewIfNeeded()
    await expect(enlargedSend).toBeInViewport()
    const enlargedNav = page.getByRole('navigation', { name: 'Основная навигация' })
    const enlargedNavFixed = await enlargedNav.evaluate(element => getComputedStyle(element).position === 'fixed')
    // Task20a intentionally moves a tall bar into ordinary flow. Only an
    // overlay reserves the lower edge; flow content uses the viewport edge.
    expect.soft((await enlargedSend.boundingBox())!.y + (await enlargedSend.boundingBox())!.height).toBeLessThanOrEqual(enlargedNavFixed ? (await enlargedNav.boundingBox())!.y + 1 : 845)
    const sendHit = await enlargedSend.evaluate(element => {
      const box = element.getBoundingClientRect()
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('.app-nav') !== null
    })
    expect.soft(sendHit, 'focused send stays clear of both fixed and flow navigation').toBe(false)
    await capture('composer-and-send')
    await takeAcceptanceScreenshot(page, info, '320-text-200-composer')
    const positionsFile = info.outputPath('320-text-200-positions.json')
    await writeFile(positionsFile, JSON.stringify(positions, null, 2))
    await info.attach('enlarged-chat-positions', { path: positionsFile, contentType: 'application/json' })
    for (const block of ['.chat-screen__heading', '.composer']) {
      const natural = await page.locator(block).evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight }))
      expect.soft(natural.scroll).toBeLessThanOrEqual(natural.client + 1)
    }
    await expect(page.locator('.chat-screen [role=alert]')).toHaveCount(0)
    expect(api.unhandled).toEqual([])
  })
}

test('late photo decoding follows the newest message and preserves an older reader anchor', async ({ browser }, info) => {
  const measurements: unknown[] = []
  for (const scenario of [{ following: true, path: '/chats/c1', height: 844 }, { following: false, path: '/chats/c1', height: 844 }, { following: true, path: '/ministries/m1/chat', height: 390 }]) {
    const { following } = scenario
    const context = await browser.newContext({ baseURL: String(info.project.use.baseURL), serviceWorkers: 'block', viewport: { width: 375, height: 844 } })
    const page = await context.newPage()
    const api = await installAcceptanceApi(page)
    let release!: () => void
    const ready = new Promise<void>(resolve => { release = resolve })
    await page.route('**/__acceptance_media/photo-*.jpg', async (route) => { await ready; await route.fallback() })
    try {
      await page.goto(scenario.path, { waitUntil: 'domcontentloaded' })
      const history = page.locator('.message-list')
      await expect(page.locator('[data-test=latest-message]')).toBeVisible()
      await expect(history.locator('img')).toHaveCount(3)
      await expect.poll(() => history.locator('img').evaluateAll(elements => elements.filter(element => (element as HTMLImageElement).naturalWidth > 0).length)).toBe(0)
      await history.evaluate(element => { element.scrollTop = element.scrollHeight })
      await settleLayout(page)
      await page.setViewportSize({ width: 375, height: scenario.height })
      await page.locator('[data-test=send]').scrollIntoViewIfNeeded()
      await settleLayout(page)
      if (!following) {
        await history.evaluate(element => { element.scrollTop = 0 })
        await settleLayout(page)
      }
      const anchor = page.locator('[data-message-id=msg0]')
      const before = await history.evaluate(element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, height: element.clientHeight }))
      const anchorTop = (await anchor.boundingBox())!.y
      release()
      await expect.poll(() => history.locator('img').evaluateAll(elements => elements.filter(element => (element as HTMLImageElement).naturalWidth > 0).length)).toBe(3)
      await settleLayout(page)
      const after = await history.evaluate(element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, height: element.clientHeight }))
      measurements.push({ ...scenario, before, after, anchorBefore: anchorTop, anchorAfter: (await anchor.boundingBox())!.y })
      if (following) {
        expect.soft(after.scrollHeight - after.scrollTop - after.height, 'decoding a real photo keeps the newest message followed').toBeLessThanOrEqual(1)
        await expect(page.locator('[data-test=latest-message]')).toBeInViewport()
      } else {
        expect.soft(Math.abs((await anchor.boundingBox())!.y - anchorTop), 'a reader of older messages is not pulled to the bottom').toBeLessThanOrEqual(1)
      }
      await takeAcceptanceScreenshot(page, info, scenario.height + (following ? '-late-photo-follow' : '-late-photo-reader'))
      expect(api.unhandled).toEqual([])
    } finally {
      release()
      await context.close()
    }
  }
  const evidenceFile = info.outputPath('late-photo-scroll.json')
  await writeFile(evidenceFile, JSON.stringify(measurements, null, 2))
  await info.attach('late-photo-scroll', { path: evidenceFile, contentType: 'application/json' })
})

test('message author and ordinary body words remain readable at 320px text 200%', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  api.data.messages[0]!.body = 'ДлинноеСлово'.repeat(30)
  await page.setViewportSize({ width: 375, height: 844 })
  await page.goto('/chats/c1')
  const last = page.locator('[data-message-id=msg7]')
  await expect(last).toBeVisible()
  const measurements: unknown[] = []
  for (const size of [{ width: 375, text: 100 }, { width: 320, text: 200 }]) {
    await page.setViewportSize({ width: size.width, height: 844 })
    if (size.text === 200) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await settleLayout(page)
    const author = last.locator('.message-heading strong'), body = last.locator('.body')
    const authorWords = await author.evaluateAll(measureWordWrapping, 12)
    const bodyWords = await body.evaluateAll(measureWordWrapping, 12)
    expect.soft(authorWords[0]!.words.some(word => word.text === 'Михаил')).toBe(true)
    expect.soft(bodyWords[0]!.words.some(word => word.text === 'подготовить')).toBe(true)
    expect.soft(authorWords[0]!.broken, 'ordinary author words receive a readable column').toEqual([])
    expect.soft(bodyWords[0]!.broken, 'ordinary body words receive a readable column').toEqual([])
    const font = await body.evaluate(element => parseFloat(getComputedStyle(element).fontSize))
    expect.soft(font, 'message text retains the requested enlargement').toBeGreaterThanOrEqual(16 * size.text / 100)
    const action = last.locator('[data-test=actions-msg7]')
    const bounds = (await action.boundingBox())!
    expect.soft(bounds.width).toBeGreaterThanOrEqual(44)
    expect.soft(bounds.height).toBeGreaterThanOrEqual(44)
    await author.scrollIntoViewIfNeeded()
    await expect(author).toBeInViewport()
    await takeAcceptanceScreenshot(page, info, size.width + '-text-' + size.text + '-message-author')
    await body.scrollIntoViewIfNeeded()
    await expect(body).toBeInViewport()
    await takeAcceptanceScreenshot(page, info, size.width + '-text-' + size.text + '-message-body')
    const longBody = page.locator('[data-message-id=msg0] .body')
    const longWords = await longBody.evaluateAll(measureWordWrapping, null)
    expect.soft(longWords[0]!.words).toHaveLength(1)
    expect.soft(longWords[0]!.words[0]!.lineTops.length, 'legal unbroken user text still wraps').toBeGreaterThan(1)
    expect.soft(await longBody.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await checkDocumentWidth(page)
    measurements.push({ ...size, font, action: bounds, author: authorWords[0], body: bodyWords[0], longWordLines: longWords[0]!.words[0]!.lineTops.length })
  }
  const file = info.outputPath('message-word-geometry.json')
  await writeFile(file, JSON.stringify(measurements, null, 2))
  await info.attach('message-word-geometry', { path: file, contentType: 'application/json' })
  expect(api.unhandled).toEqual([])
})
