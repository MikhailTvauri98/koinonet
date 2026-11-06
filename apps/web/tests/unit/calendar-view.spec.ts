// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { calendarRange, calendarQuery, readCalendarQuery, safeCalendarReturn, shiftCalendarMonth } from '~/composables/useCalendarView'
import { groupCalendarDays } from '~/composables/useEvents'
import type { EventItem } from '~/composables/useEvents'

describe('calendar navigation', () => {
  it('validates civil dates, views and allowed scopes instead of trusting query arrays', () => {
    expect(readCalendarQuery({ date: '2027-02-29', view: ['month'], scope: 'ministry:hidden' }, '2026-11-08', 'list')).toEqual({ date: '2026-11-08', view: 'list', scope: 'church' })
    expect(readCalendarQuery({ date: '2028-02-29', view: 'month', scope: 'mine' }, '2026-11-08', 'list')).toEqual({ date: '2028-02-29', view: 'month', scope: 'mine' })
    expect(readCalendarQuery({ scope: 'ministry:hidden' }, '2026-11-08', 'month', 'ministry:m1').scope).toBe('ministry:m1')
  })
  it('includes every adjacent day displayed by a Monday-first month and only month days in list', () => {
    expect(calendarRange({ date: '2026-11-08', view: 'month', scope: 'church' })).toEqual({ from: '2026-10-26', to: '2026-12-06' })
    expect(calendarRange({ date: '2028-02-29', view: 'list', scope: 'church' })).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(shiftCalendarMonth('2026-12-31', 1)).toBe('2027-01-31')
    expect(shiftCalendarMonth('2027-01-31', 1)).toBe('2027-02-28')
  })
  it('round-trips only allowed internal calendar context', () => {
    const query = calendarQuery({ date: '2026-12-31', view: 'month', scope: 'mine' })
    expect(safeCalendarReturn('/calendar?' + new URLSearchParams(query))).toBe('/calendar?date=2026-12-31&view=month&scope=mine')
    for (const value of ['https://evil.test/calendar', '//evil.test/calendar', '/calendar?date=oops', '/people', '/calendar/../people', ['/calendar'], '/calendar?date=2026-12-31&view=list&scope=church&return=https://evil.test']) expect(safeCalendarReturn(value)).toBe('/calendar')
    expect(safeCalendarReturn('/ministries/m1/events?date=2026-12-31&view=list&scope=ministry%3Am1')).toBe('/ministries/m1/events?date=2026-12-31&view=list&scope=ministry%3Am1')
  })
})

describe('visible church days of events', () => {
  const event = (id: string, starts_at: string, ends_at: string) => ({ id, starts_at, ends_at } as EventItem)
  it('repeats overnight events on each touched date, respecting an exclusive midnight end', () => {
    const groups = groupCalendarDays([event('overnight', '2026-12-31T20:00:00Z', '2026-12-31T22:00:00Z'), event('midnight', '2026-12-31T20:00:00Z', '2026-12-31T21:00:00Z')], 'Europe/Moscow', { from: '2026-12-31', to: '2027-01-01' })
    expect(groups.map(g => [g.day, g.events.map(e => e.id)])).toEqual([['2026-12-31', ['midnight', 'overnight']], ['2027-01-01', ['overnight']]])
  })
  it('clips very long events to the visible dates, independent of the device timezone', () => {
    const groups = groupCalendarDays([event('long', '2020-01-01T00:00:00Z', '2040-01-01T00:00:00Z')], 'America/Los_Angeles', { from: '2026-11-08', to: '2026-11-09' })
    expect(groups.map(g => g.day)).toEqual(['2026-11-08', '2026-11-09'])
  })
})
