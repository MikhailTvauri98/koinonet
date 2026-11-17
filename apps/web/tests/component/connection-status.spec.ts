// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import ConnectionStatus from '~/components/ConnectionStatus.vue'

const state = ref<'online' | 'reconnecting' | 'offline'>('online')
const failures = ref(0)
const retry = vi.fn()
mockNuxtImport('useRealtimeStatus', () => () => ({ state, failures, retry }))

enableAutoUnmount(afterEach)
beforeEach(() => { setActivePinia(createPinia()); state.value = 'online'; failures.value = 0; retry.mockReset() })

describe('connection status', () => {
  it('renders nothing while online', async () => {
    const bar = await mountSuspended(ConnectionStatus)
    expect(bar.text()).toBe('')
    expect(bar.find('[role=status]').exists()).toBe(false)
  })

  it('shows one calm status without an alert while reconnecting', async () => {
    state.value = 'reconnecting'; failures.value = 1
    const bar = await mountSuspended(ConnectionStatus)
    expect(bar.findAll('[role=status]')).toHaveLength(1)
    expect(bar.find('[role=alert]').exists()).toBe(false)
    expect(bar.text()).toContain('Нет связи. Переподключаемся…')
    expect(bar.find('button').exists()).toBe(false)
  })

  it('offers a retry button after the third failure and calls retry', async () => {
    state.value = 'reconnecting'; failures.value = 2
    const bar = await mountSuspended(ConnectionStatus)
    expect(bar.find('button').exists()).toBe(false)
    failures.value = 3
    await nextTick()
    const button = bar.get('button')
    expect(button.text()).toBe('Повторить')
    await button.trigger('click')
    expect(retry).toHaveBeenCalledOnce()
  })

  it('also shows the status when the browser is offline and disappears on recovery', async () => {
    state.value = 'offline'
    const bar = await mountSuspended(ConnectionStatus)
    expect(bar.text()).toContain('Нет связи')
    state.value = 'online'; failures.value = 0
    await nextTick()
    expect(bar.text()).toBe('')
  })
})
