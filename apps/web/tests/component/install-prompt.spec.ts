// @vitest-environment nuxt
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InstallPrompt from '~/components/InstallPrompt.vue'

function platform(ua: string, standalone = false) {
  vi.stubGlobal('navigator', { userAgent: ua, standalone })
  vi.stubGlobal('matchMedia', () => ({ matches: standalone, addEventListener() {}, removeEventListener() {} }))
}

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'

enableAutoUnmount(afterEach)

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

  it('keeps a failed native prompt retryable and prevents a duplicate prompt while pending', async () => {
    platform(ANDROID_CHROME)
    const wrapper = await mountSuspended(InstallPrompt)
    let reject!: (error: Error) => void
    const prompt = vi.fn().mockReturnValueOnce(new Promise((_, fail) => { reject = fail })).mockResolvedValueOnce(undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), { prompt })
    window.dispatchEvent(event)
    await flushPromises()
    await wrapper.get('[data-test="install-button"]').trigger('click')
    expect(wrapper.get('[data-test="install-button"]').attributes('disabled')).toBeDefined()
    reject(new Error('prompt unavailable'))
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Не удалось открыть')
    await wrapper.get('[data-test="install-button"]').trigger('click')
    await flushPromises()
    expect(prompt).toHaveBeenCalledTimes(2)
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
