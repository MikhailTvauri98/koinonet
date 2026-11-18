// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '~/stores/auth'
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

describe('compact offer on the notifications page', () => {
  it('is one line with the phone wording and a short action, without a heading', async () => {
    const wrapper = await mountSuspended(EnableNotificationsButton, { props: { compact: true } })
    expect(wrapper.find('h2').exists()).toBe(false)
    expect(wrapper.text()).toContain('Получать уведомления на телефон')
    expect(wrapper.text()).not.toContain('Получайте уведомления, даже когда')
    const button = wrapper.get('[data-test="enable-push"]')
    expect(button.text()).toBe('Включить')
    await button.trigger('click')
    expect(subscribe).toHaveBeenCalledOnce()
  })
  it('keeps the explanatory states instead of the offer', async () => {
    platform.isIos = true; platform.isStandalone = false; state.supported = false
    const ios = await mountSuspended(EnableNotificationsButton, { props: { compact: true } })
    expect(ios.text()).toContain('экран «Домой»')
    expect(ios.find('[data-test="enable-push"]').exists()).toBe(false)
    platform.isIos = false; platform.isStandalone = true; state.supported = true; state.permission.value = 'denied'
    const denied = await mountSuspended(EnableNotificationsButton, { props: { compact: true } })
    expect(denied.text()).toContain('запрещены в настройках')
    expect(denied.find('[data-test="enable-push"]').exists()).toBe(false)
  })
  it('shows a failure next to the offer and allows a retry', async () => {
    subscribe.mockRejectedValueOnce(new Error('offline'))
    const wrapper = await mountSuspended(EnableNotificationsButton, { props: { compact: true } })
    await wrapper.get('[data-test="enable-push"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Не удалось включить')
    expect(wrapper.get('[data-test="enable-push"]').attributes('disabled')).toBeUndefined()
  })
})

describe('enable notifications button', () => {
  it('only subscribes after an explicit click', async () => {
    const wrapper = await mountSuspended(EnableNotificationsButton)
    expect(subscribe).not.toHaveBeenCalled()
    await wrapper.find('[data-test="enable-push"]').trigger('click')
    expect(subscribe).toHaveBeenCalledOnce()
  })
  it('ignores an old session failure after logout and relogin, including the same account', async () => {
    let reject!: (error: Error) => void
    subscribe.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    const wrapper = await mountSuspended(EnableNotificationsButton)
    await wrapper.get('[data-test="enable-push"]').trigger('click')
    useAuthStore().sessionVersion++
    await flushPromises()
    reject(new Error('old session failed'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="enable-push"]').attributes('disabled')).toBeUndefined()
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
