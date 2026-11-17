// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarWeekStrip from '~/components/calendar/CalendarWeekStrip.vue'
import type { EventItem } from '~/composables/useEvents'
import { useSettingsStore } from '~/stores/settings'

enableAutoUnmount(afterEach)
const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1', chat_id: null, owner_type: 'church', ministry: null, template_id: null, occurrence_date: null,
  title: 'Событие', description: null, location: null,
  starts_at: '2026-11-17T07:00:00Z', ends_at: '2026-11-17T08:00:00Z', visibility: 'church', status: 'scheduled',
  cancelled_at: null, cancel_reason: null, can_manage: false, attachments: [], slots: [], ...over,
})
beforeEach(() => {
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Asia/Vladivostok' } as never)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-17T01:00:00Z'))
})
afterEach(() => vi.useRealTimers())
const days = (strip: Awaited<ReturnType<typeof mount>>) => strip.findAll('[data-test^="strip-day-"]')
const mount = (date: string, events: EventItem[] = []) => mountSuspended(CalendarWeekStrip, { props: { date, events } })

describe('calendar week strip', () => {
  it('shows seven days from Monday with the selected one pressed and a full accessible name', async () => {
    const strip = await mount('2026-11-18', [event()])
    const buttons = days(strip)
    expect(buttons.map(button => button.attributes('data-test'))).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map(day => `strip-day-${day}`))
    expect(buttons.map(button => button.attributes('aria-pressed'))).toEqual(['false', 'false', 'true', 'false', 'false', 'false', 'false'])
    expect(buttons[1]!.attributes('aria-label')).toBe('Вторник, 17 ноября, событий: 1')
    expect(buttons[0]!.attributes('aria-label')).toBe('Понедельник, 16 ноября, событий: 0')
  })
  it('emits the chosen day', async () => {
    const strip = await mount('2026-11-18')
    await strip.get('[data-test="strip-day-2026-11-20"]').trigger('click')
    expect(strip.emitted('select')).toEqual([['2026-11-20']])
  })
  it('turns the week across a month and a year boundary with the arrows', async () => {
    const strip = await mount('2026-12-30')
    await strip.get('[data-test="strip-next"]').trigger('click')
    expect(strip.emitted('select')?.[0]).toEqual(['2027-01-06'])
    await strip.get('[data-test="strip-previous"]').trigger('click')
    expect(strip.emitted('select')?.[1]).toEqual(['2026-12-23'])
    const boundary = await mount('2026-12-31')
    expect(days(boundary).map(button => button.attributes('data-test')?.slice(-10))).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
  })
  it('turns the week by a horizontal swipe but not by a vertical drag', async () => {
    const strip = await mount('2026-11-18')
    const area = strip.get('[data-test="strip-days"]')
    await area.trigger('pointerdown', { clientX: 300, clientY: 10, pointerId: 1 }); await area.trigger('pointerup', { clientX: 200, clientY: 14, pointerId: 1 })
    expect(strip.emitted('select')?.[0]).toEqual(['2026-11-25'])
    await area.trigger('pointerdown', { clientX: 100, clientY: 10, pointerId: 2 }); await area.trigger('pointerup', { clientX: 210, clientY: 12, pointerId: 2 })
    expect(strip.emitted('select')?.[1]).toEqual(['2026-11-11'])
    await area.trigger('pointerdown', { clientX: 100, clientY: 10, pointerId: 3 }); await area.trigger('pointerup', { clientX: 110, clientY: 90, pointerId: 3 })
    expect(strip.emitted('select')).toHaveLength(2)
  })
  it('counts events by church day, including multi-day events, and shows up to three distinct ministry colors', async () => {
    const strip = await mount('2026-11-17', [
      event({ id: 'a', ministry: { id: 'm1', name: 'Хор', color: 'teal' } }),
      event({ id: 'b', ministry: { id: 'm1', name: 'Хор', color: 'teal' } }),
      event({ id: 'c', ministry: { id: 'm2', name: 'Дети', color: null } }),
      event({ id: 'd' }),
      event({ id: 'e', ministry: { id: 'm3', name: 'Молодёжь', color: 'rose' } }),
      event({ id: 'f', ministry: { id: 'm4', name: 'Служение', color: 'amber' }, starts_at: '2026-11-17T07:00:00Z', ends_at: '2026-11-18T07:00:00Z' }),
    ])
    const tuesday = strip.get('[data-test="strip-day-2026-11-17"]')
    expect(tuesday.attributes('aria-label')).toBe('Вторник, 17 ноября, событий: 6')
    const dots = tuesday.findAll('.week-strip__dot')
    expect(dots).toHaveLength(3); expect(tuesday.get('.week-strip__dots').attributes('aria-hidden')).toBe('true')
    expect(dots[0]!.attributes('style')).toContain('--ui-ministry-teal')
    expect(strip.get('[data-test="strip-day-2026-11-18"]').attributes('aria-label')).toBe('Среда, 18 ноября, событий: 1')
  })
  it('marks today by the church calendar rather than the device calendar', async () => {
    const strip = await mount('2026-11-17')
    expect(strip.get('[data-test="strip-day-2026-11-17"]').attributes('aria-current')).toBe('date')
    expect(strip.get('[data-test="strip-day-2026-11-16"]').attributes('aria-current')).toBeUndefined()
  })
})
