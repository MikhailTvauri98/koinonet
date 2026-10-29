// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EnableNotificationsButton from '~/components/notifications/EnableNotificationsButton.vue'

const subscribe = vi.fn()
const state = { supported: true, permission: ref<NotificationPermission | 'unsupported'>('default'), subscribed: ref(false), subscribe, unsubscribe: vi.fn() }
const platform = { isIos: false, isStandalone: true }
mockNuxtImport('usePush', () => () => state)
mockNuxtImport('usePlatform', () => () => platform)
enableAutoUnmount(afterEach)
beforeEach(() => {
  subscribe.mockReset()
  state.supported = true
  state.permission.value = 'default'
  state.subscribed.value = false
  platform.isIos = false
  platform.isStandalone = true
})

describe('enable notifications button', () => {
  it('only subscribes after an explicit click', async () => {
    const wrapper = await mountSuspended(EnableNotificationsButton)
    expect(subscribe).not.toHaveBeenCalled()
    await wrapper.find('[data-test="enable-push"]').trigger('click')
    expect(subscribe).toHaveBeenCalledOnce()
  })
  it('explains installation on iOS Safari even when push APIs are missing', async () => {
    platform.isIos = true
    platform.isStandalone = false
    state.supported = false
    const wrapper = await mountSuspended(EnableNotificationsButton)
    expect(wrapper.text()).toContain('экран «Домой»')
    expect(wrapper.find('[data-test="enable-push"]').exists()).toBe(false)
  })
  it('explains denied permission', async () => {
    state.permission.value = 'denied'
    const wrapper = await mountSuspended(EnableNotificationsButton)
    expect(wrapper.text()).toContain('запрещены в настройках')
    expect(wrapper.find('[data-test="enable-push"]').exists()).toBe(false)
  })
  it('shows success after subscribing', async () => {
    state.subscribed.value = true
    state.permission.value = 'granted'
    const wrapper = await mountSuspended(EnableNotificationsButton)
    expect(wrapper.text()).toContain('Уведомления включены')
    expect(wrapper.find('[data-test="enable-push"]').exists()).toBe(false)
  })
  it('explains unsupported browsers', async () => {
    state.supported = false
    const wrapper = await mountSuspended(EnableNotificationsButton)
    expect(wrapper.text()).toContain('не поддерживает')
    expect(wrapper.find('[data-test="enable-push"]').exists()).toBe(false)
  })
  it('blocks repeated clicks while pending and allows retry after a failure', async () => {
    let reject!: (reason: Error) => void
    subscribe.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    const wrapper = await mountSuspended(EnableNotificationsButton)
    const button = wrapper.find('[data-test="enable-push"]')
    await button.trigger('click')
    expect(button.attributes('disabled')).toBeDefined()
    reject(new Error('offline'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Не удалось включить')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(subscribe).toHaveBeenCalledTimes(2)
  })
})
