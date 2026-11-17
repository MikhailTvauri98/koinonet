// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MuteMenu from '~/components/chat/MuteMenu.vue'
import { useSettingsStore } from '~/stores/settings'

beforeEach(() => {
  useSettingsStore().timezone = 'Europe/Moscow'
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

it('shows the hour of an 8-hour mute that ends tomorrow in church time', async () => {
  vi.setSystemTime(new Date('2026-11-17T17:00:00Z')) // 20:00 по церкви
  const until = new Date(Date.now() + 8 * 3_600_000).toISOString() // 04:00 завтра
  const page = await mountSuspended(MuteMenu, { props: { until } })
  expect(page.get('[role="status"]').text()).toBe('Без звука до завтра, 04:00')
})

it('shows only the time for a mute ending the same church day', async () => {
  vi.setSystemTime(new Date('2026-11-17T06:20:00Z')) // 09:20
  const until = new Date(Date.now() + 8 * 3_600_000).toISOString() // 17:20
  const page = await mountSuspended(MuteMenu, { props: { until } })
  expect(page.get('[role="status"]').text()).toBe('Без звука до 17:20')
})
