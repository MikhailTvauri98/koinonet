// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevicesPage from '~/pages/settings/devices.vue'

// Дополняет бриф profile.spec.ts: там проверяется только disabled на
// текущей сессии, здесь — самопроверка "даты в поясе церкви, тестом с
// поясом, отличным от машины" и обработка ошибок завершения устройства.
const get = vi.fn()
const post = vi.fn()
const del = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post, delete: del }))

const sessions = [
  { id: 's1', ip_address: '10.0.0.1', user_agent: 'iPhone', last_activity: '2026-01-01T23:30:00Z', current: true },
  { id: 's2', ip_address: '10.0.0.2', user_agent: 'Chrome', last_activity: '2026-01-01T09:00:00Z', current: false },
]

beforeEach(() => {
  [get, post, del].forEach(fn => fn.mockReset())
  get.mockImplementation((path: string) => Promise.resolve(
    path.startsWith('/settings')
      ? { data: { church_name: 'Дом хлеба', timezone: 'Pacific/Kiritimati' } }
      : { data: sessions },
  ))
  del.mockResolvedValue(undefined)
})

describe('devices page', () => {
  it('shows the last activity in the church timezone, not the UTC one embedded in the response', async () => {
    const page = await mountSuspended(DevicesPage)
    await flushPromises()

    // Kiritimati (UTC+14): 23:30 UTC 1 января -> 13:30 2 января по месту.
    expect(page.text()).toContain('02.01.2026, 13:30')
  })

  it('ends a specific other device', async () => {
    del.mockResolvedValue(undefined)
    const page = await mountSuspended(DevicesPage)
    await flushPromises()
    await page.find('[data-test="end-s2"]').trigger('click')
    await flushPromises()

    expect(del).toHaveBeenCalledWith('/auth/sessions/s2')
  })

  it('shows an error and keeps the list when ending a device fails', async () => {
    del.mockRejectedValue(new Error('failed'))
    const page = await mountSuspended(DevicesPage)
    await flushPromises()
    await page.find('[data-test="end-s2"]').trigger('click')
    await flushPromises()

    expect(page.text()).toContain('Не удалось завершить')
    expect(page.find('[data-test="end-s2"]').exists()).toBe(true)
  })
})
