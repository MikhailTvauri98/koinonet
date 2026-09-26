// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InstallPrompt from '~/components/InstallPrompt.vue'

function platform(ua: string, standalone = false) {
  vi.stubGlobal('navigator', { userAgent: ua, standalone })
  vi.stubGlobal('matchMedia', () => ({ matches: standalone, addEventListener() {}, removeEventListener() {} }))
}

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('install prompt', () => {
  it('shows ios instructions in mobile safari outside standalone', async () => {
    platform(IOS_SAFARI)

    const prompt = await mountSuspended(InstallPrompt)

    expect(prompt.text()).toContain('Поделиться')
    expect(prompt.text()).toContain('На экран «Домой»')
  })

  it('hides itself when the app runs in standalone mode', async () => {
    platform(IOS_SAFARI, true)

    const prompt = await mountSuspended(InstallPrompt)

    expect(prompt.find('[data-test="install-prompt"]').exists()).toBe(false)
  })

  it('offers the native install button on android after beforeinstallprompt', async () => {
    platform(ANDROID_CHROME)
    const prompt = await mountSuspended(InstallPrompt)

    const event = Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(), preventDefault: vi.fn() })
    window.dispatchEvent(event)
    await prompt.vm.$nextTick()

    await prompt.find('[data-test="install-button"]').trigger('click')
    expect(event.prompt).toHaveBeenCalled()
  })

  it('stays hidden after the person dismissed it', async () => {
    platform(IOS_SAFARI)
    const first = await mountSuspended(InstallPrompt)
    await first.find('[data-test="dismiss-install"]').trigger('click')

    const second = await mountSuspended(InstallPrompt)

    expect(second.find('[data-test="install-prompt"]').exists()).toBe(false)
  })

  it('does not crash when localStorage throws (private browsing), and still dismisses for the session', async () => {
    platform(IOS_SAFARI)
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem() {
        throw new DOMException('blocked', 'SecurityError')
      },
      removeItem() {},
      clear() {},
      key() {
        return null
      },
      length: 0,
    })

    const prompt = await mountSuspended(InstallPrompt)

    // Чтение бросило — компонент не падает и считает подсказку неотклонённой.
    expect(prompt.find('[data-test="install-prompt"]').exists()).toBe(true)

    // Запись тоже бросает, но в рамках этой сессии (реактивное состояние) отказ
    // всё равно работает — просто не переживёт перезагрузку страницы.
    await prompt.find('[data-test="dismiss-install"]').trigger('click')
    expect(prompt.find('[data-test="install-prompt"]').exists()).toBe(false)
  })
})
