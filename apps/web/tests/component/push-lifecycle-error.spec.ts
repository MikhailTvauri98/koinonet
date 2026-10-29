// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
import PushLifecycleError from '~/components/notifications/PushLifecycleError.vue'

const state = { error: ref(''), retry: vi.fn() }
mockNuxtImport('usePush', () => () => state)

it('shows the shared unsafe teardown error and lets the person retry it from any page', async () => {
  const wrapper = await mountSuspended(PushLifecycleError)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  state.error.value = 'Не удалось отключить пуши прежнего аккаунта.'
  await flushPromises()
  expect(wrapper.find('[role="alert"]').text()).toContain('прежнего аккаунта')
  state.retry.mockImplementation(async () => { state.error.value = '' })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(state.retry).toHaveBeenCalledOnce()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})
