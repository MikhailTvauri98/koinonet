import { expect, type Page, type TestInfo } from '@playwright/test'

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
