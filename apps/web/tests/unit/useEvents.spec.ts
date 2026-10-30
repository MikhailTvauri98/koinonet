// @vitest-environment nuxt
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { addCalendarDays, calendarWeekStart, formatCalendarDay, groupByChurchDay, useEvents } from '~/composables/useEvents'
import type { EventItem } from '~/composables/useEvents'
import { useAuthStore } from '~/stores/auth'

const get = vi.fn()
mockNuxtImport('useApi', () => () => ({ get }))
beforeEach(() => { setActivePinia(createPinia()); get.mockReset() })
const event = (id: string, starts_at: string) => ({ id, starts_at } as EventItem)
describe('church calendar dates', () => {
  it('groups and sorts by the church day rather than UTC', () => {
    const groups = groupByChurchDay([event('a', '2026-11-08T20:30:00Z'), event('b', '2026-11-08T01:00:00Z')], 'Asia/Vladivostok')
    expect(groups.map(group => group.day)).toEqual(['2026-11-08', '2026-11-09'])
    expect(groups[0]!.events[0]!.id).toBe('b')
  })
  it('keeps western civil labels and week arithmetic independent of the device timezone', () => {
    expect(groupByChurchDay([event('a', '2026-11-09T02:00:00Z')], 'America/Los_Angeles')[0]!.day).toBe('2026-11-08')
    expect(calendarWeekStart('2026-11-08')).toBe('2026-11-02')
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(formatCalendarDay('2026-11-08')).toContain('8 ноября')
  })
})
describe('event loading', () => {
  it('loads all pages with the same range and scope and deduplicates IDs', async () => {
    get.mockResolvedValueOnce({ data: [event('a', '2026-11-08T01:00:00Z')], meta: { current_page: 1, last_page: 2 } })
      .mockResolvedValueOnce({ data: [event('a', '2026-11-08T01:00:00Z'), event('b', '2026-11-09T01:00:00Z')], meta: { current_page: 2, last_page: 2 } })
    const range = { from: '2026-11-02', to: '2026-11-29' }
    expect((await useEvents().load(range, 'mine')).map(item => item.id)).toEqual(['a', 'b'])
    expect(get).toHaveBeenLastCalledWith('/events', { ...range, scope: 'mine', page: 2, per_page: 200 })
  })
  it('does not return data from a previous session or continue its pagination', async () => {
    const auth = useAuthStore()
    get.mockImplementationOnce(async () => { auth.sessionVersion++; return { data: [event('a', '')], meta: { current_page: 1, last_page: 2 } } })
    await expect(useEvents().load({ from: '2026-11-02', to: '2026-11-29' }, 'mine')).rejects.toThrow('Session changed')
    expect(get).toHaveBeenCalledTimes(1)
  })
})
