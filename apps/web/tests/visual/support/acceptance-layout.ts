import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

export async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

export async function checkDocumentWidth(page: Page) {
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll('main input, main select, main textarea, main fieldset, main h1, main h2'))
      .map(element => ({ element, bounds: element.getBoundingClientRect() }))
      .filter(({ element, bounds }) => bounds.width > 0 && !element.closest('dialog:not([open])') && (bounds.left < -1 || bounds.right > innerWidth + 1))
      .map(({ element, bounds }) => ({ tag: element.tagName, label: element.textContent?.trim().slice(0, 60), left: bounds.left, right: bounds.right })),
  }))
  expect.soft(geometry.scrollWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.width + 1)
  expect.soft(geometry.overflowing, 'headings and form fields remain inside the viewport').toEqual([])
  return geometry.scrollWidth
}

export async function takeAcceptanceScreenshot(page: Page, info: TestInfo, name: string) {
  // DevTools is test infrastructure; product content keeps its own overflow.
  const style = await page.addStyleTag({ content: 'nuxt-devtools-frame { display: none !important; }' })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true })
  await style.evaluate(element => element.parentNode?.removeChild(element))
}

export async function focusReachableAction(page: Page, preferred?: Locator) {
  const controls = page.locator('main a[href], main button:enabled, main input:enabled:not([type=hidden]), main select:enabled, main textarea:enabled')
  if (preferred) await expect(preferred, 'the workflow control exists').toHaveCount(1)
  for (const control of preferred ? [preferred] : await controls.all()) {
    if (preferred) await expect(control).toBeEnabled()
    if (!await control.isVisible()) continue
    const box = await control.boundingBox()
    if (!box || !preferred && box.height > page.viewportSize()!.height - 32) continue
    await control.focus()
    await expect(control, 'native action receives real focus').toBeFocused()
    await control.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await expect(control, 'focused action is wholly in the short viewport').toBeInViewport({ ratio: 1 })
    expect(await control.evaluate(element => {
      const box = element.getBoundingClientRect()
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return Boolean(hit && (hit === element || element.contains(hit)) && !hit.closest('.app-nav'))
    }), 'focused action is hit-testable and not covered by navigation').toBe(true)
    return control.evaluate(element => ({ tag: element.tagName, dataTest: element.getAttribute('data-test'), label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '', name: element.getAttribute('name') }))
  }
  throw new Error('The route has no reachable enabled action')
}
