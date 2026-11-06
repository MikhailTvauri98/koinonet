import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { installAcceptanceApi, longFileName, mediaFiles, mediaUrl } from './support/acceptance-api'
import { checkDocumentWidth, takeAcceptanceScreenshot } from './support/acceptance-layout'

const fixtureFile = (name: string) => fileURLToPath(new URL('./fixtures/' + name, import.meta.url))

test('square, portrait and landscape attachments decode without widening a narrow page', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/announcements/a1')
  const attachments = page.getByRole('list', { name: 'Вложения', exact: true })
  await expect(attachments.getByRole('img')).toHaveCount(3)
  for (const [index, dimensions] of [[0, [500, 500]], [1, [500, 637]], [2, [960, 612]]] as const) {
    const image = attachments.getByRole('img').nth(index)
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate(element => [(element as HTMLImageElement).naturalWidth, (element as HTMLImageElement).naturalHeight])).toEqual(dimensions)
    const box = await image.boundingBox()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  }
  const documentLink = attachments.getByRole('link').last()
  await expect(documentLink).toHaveAttribute('href', mediaUrl(longFileName))
  // Fetch through the actual UI href to prove these controlled bytes are
  // nonempty. It is deliberately not a claim about nginx/signed-link delivery.
  const documentText = await documentLink.evaluate(async (link) => (await fetch(link.getAttribute('href')!)).text())
  expect(documentText).toContain('План подготовки воскресного события')
  await checkDocumentWidth(page)
  await takeAcceptanceScreenshot(page, info, 'attachments-320')
  expect(api.unhandled).toEqual([])
})

test('portrait photo and wide cover load without stretching their content', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  api.data.person.photo_url = mediaUrl(mediaFiles.portrait.name)
  await page.setViewportSize({ width: 375, height: 667 })
  for (const [path, selector, dimensions] of [
    ['/people/p1', '[data-test=person-photo]', [500, 637]],
    ['/ministries/m1', '[data-test=ministry-cover]', [960, 612]],
  ] as const) {
    await page.goto(path)
    const image = page.locator(selector)
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate(element => [(element as HTMLImageElement).naturalWidth, (element as HTMLImageElement).naturalHeight])).toEqual(dimensions)
    const sizing = await image.evaluate((element) => {
      const image = element as HTMLImageElement
      const bounds = image.getBoundingClientRect()
      return { fit: getComputedStyle(image).objectFit, renderedRatio: bounds.width / bounds.height, naturalRatio: image.naturalWidth / image.naturalHeight }
    })
    expect.soft(['cover', 'contain', 'scale-down'].includes(sizing.fit) || Math.abs(sizing.renderedRatio - sizing.naturalRatio) < 0.02, 'image preserves its ratio or uses an intentional crop').toBe(true)
    await checkDocumentWidth(page)
    await takeAcceptanceScreenshot(page, info, path === '/people/p1' ? 'portrait-photo' : 'wide-cover')
  }
  expect(api.unhandled).toEqual([])
})

test('a failed image leaves the announcement and its attachment link reachable', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  api.data.announcement.attachments = [{ ...api.data.media[0]!, thumb_url: mediaUrl('broken.png') }]
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/announcements/a1')
  await expect(page.getByRole('heading', { name: 'Подготовка к воскресенью', exact: true })).toBeVisible()
  const image = page.getByRole('img', { name: 'Изображение 1', exact: true })
  await image.scrollIntoViewIfNeeded()
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth === 0)).toBe(true)
  const link = page.getByRole('list', { name: 'Вложения', exact: true }).getByRole('link')
  await link.focus()
  await expect(link).toBeFocused()
  await expect(link).toHaveAttribute('href', mediaUrl('photo-square.jpg'))
  await checkDocumentWidth(page)
  await takeAcceptanceScreenshot(page, info, 'broken-image-320')
  expect(api.unhandled).toEqual([])
})

test('a long filename survives upload failure, retry and removal without enabling an empty send', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  api.respond('POST', '/media', () => ({ status: 422, json: { message: 'Не удалось загрузить файл. Выберите его ещё раз.' } }))
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/chats/c1')
  const file = { name: longFileName, mimeType: 'text/plain', buffer: readFileSync(fixtureFile('document.txt')) }
  await page.locator('input[type=file]').setInputFiles(file)
  await expect(page.locator('[data-test=media-error]')).toContainText('Выберите его ещё раз')
  await expect(page.getByRole('button', { name: 'Отправить', exact: true })).toBeDisabled()
  await checkDocumentWidth(page)
  await takeAcceptanceScreenshot(page, info, 'upload-error-long-name')

  // A new route lifetime clears the failed local preview; no server write is
  // pretended successful by a universal empty fixture response.
  api.respond('POST', '/media', () => ({ status: 201, json: { data: api.data.media[3] } }))
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(file)
  const previews = page.getByRole('list', { name: 'Выбранные вложения', exact: true })
  await expect(previews).toContainText(longFileName)
  const remove = previews.getByRole('button', { name: 'Убрать ' + longFileName, exact: true })
  await expect(remove).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Отправить', exact: true })).toBeEnabled()
  await checkDocumentWidth(page)
  await takeAcceptanceScreenshot(page, info, 'ready-long-filename')
  await remove.click()
  await expect(previews.getByRole('listitem')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отправить', exact: true })).toBeDisabled()
  expect(api.unhandled).toEqual([])
})

test('a selected portrait has a decoded local preview and can be removed', async ({ page }, info) => {
  const api = await installAcceptanceApi(page)
  api.respond('POST', '/media', () => ({ status: 201, json: { data: api.data.media[1] } }))
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/chats/c1')
  await page.locator('input[type=file]').setInputFiles({ name: 'portrait-upload.jpg', mimeType: 'image/jpeg', buffer: readFileSync(fixtureFile('photo-portrait.jpg')) })
  const preview = page.getByRole('img', { name: 'portrait-upload.jpg', exact: true })
  await expect.poll(() => preview.evaluate(element => [(element as HTMLImageElement).naturalWidth, (element as HTMLImageElement).naturalHeight])).toEqual([500, 637])
  const remove = page.getByRole('button', { name: 'Убрать portrait-upload.jpg', exact: true })
  await expect(remove).toBeEnabled()
  await checkDocumentWidth(page)
  await takeAcceptanceScreenshot(page, info, 'portrait-local-preview')
  await remove.click()
  await expect(preview).toHaveCount(0)
  expect(api.unhandled).toEqual([])
})

// Task17: announcement-only media scenarios; shared contracts remain unchanged.
for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440]) {
    test(`task17 ${theme} ${width}: announcement gallery decodes real image proportions`, async ({ page }, info) => {
      const api = await installAcceptanceApi(page)
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
      await page.goto('/announcements/a1')
      const images = page.getByRole('list', { name: 'Вложения', exact: true }).getByRole('img')
      await expect(page.getByRole('heading', { name: api.data.announcement.title, exact: true })).toBeVisible()
      await expect(images).toHaveCount(3)
      for (const image of await images.all()) {
        await image.scrollIntoViewIfNeeded()
        await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      }
      await checkDocumentWidth(page)
      await takeAcceptanceScreenshot(page, info, `task17-${theme}-${width}-announcement-gallery`)
      expect(api.unhandled).toEqual([])
    })
  }
  test(`task17 ${theme}: announcement processing failure, retry and confirmed publication survive a failed read`, async ({ page }, info) => {
    const api = await installAcceptanceApi(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(theme => localStorage.setItem('church.ui.theme', theme), theme)
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    api.respond('POST', '/media', () => ({ status: 201, json: { data: { ...api.data.media[0], status: 'processing' } } }))
    api.respond('GET', '/media/media-square/status', async () => { await pending; return { json: { data: { ...api.data.media[0], status: 'failed' } } } })
    await page.goto('/announcements')
    await page.getByRole('button', { name: 'Опубликовать объявление', exact: true }).click()
    await page.getByRole('textbox', { name: 'Заголовок', exact: true }).fill('Публикация с вложением')
    await page.getByRole('textbox', { name: 'Текст объявления', exact: true }).fill('Подробности публикации')
    const file = { name: 'photo-square.jpg', mimeType: 'image/jpeg', buffer: readFileSync(fixtureFile('photo-square.jpg')) }
    await page.locator('input[type=file]').setInputFiles(file)
    await expect(page.getByRole('button', { name: 'Обрабатывается…', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Опубликовать', exact: true })).toBeDisabled()
    await takeAcceptanceScreenshot(page, info, `task17-${theme}-processing`)
    finish()
    await expect(page.locator('[data-test=media-error]')).toContainText('Не удалось обработать файл.')
    await expect(page.getByRole('button', { name: 'Опубликовать', exact: true })).toBeDisabled()
    await takeAcceptanceScreenshot(page, info, `task17-${theme}-processing-failed`)
    api.respond('POST', '/media', () => ({ status: 201, json: { data: api.data.media[0] } }))
    await page.locator('input[type=file]').setInputFiles(file)
    await expect(page.getByRole('button', { name: 'Опубликовать', exact: true })).toBeEnabled()
    let writes = 0
    api.respond('POST', '/announcements', request => {
      writes++
      expect(request.postDataJSON().media_ids).toEqual(['media-square'])
      return { status: 201, json: { data: api.data.announcement } }
    })
    api.respond('GET', '/announcements', () => ({ status: 500, json: { message: 'Private diagnostic' } }))
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click()
    await expect(page.locator('[data-test=published-result]')).toHaveAttribute('href', '/announcements/a1')
    await expect(page.locator('[data-test=retry-announcements]')).toBeVisible()
    await takeAcceptanceScreenshot(page, info, `task17-${theme}-confirmed-refresh-failed`)
    api.respond('GET', '/announcements', () => ({ json: { data: [api.data.announcement], meta: { current_page: 1, last_page: 1, total: 1 } } }))
    await page.locator('[data-test=retry-announcements]').click()
    await expect(page.locator('.announcement-card')).toHaveCount(1)
    await expect(page.locator('[data-test=published-result]')).toBeVisible()
    expect(writes).toBe(1)
    await checkDocumentWidth(page)
    expect(api.unhandled).toEqual([])
  })
}
