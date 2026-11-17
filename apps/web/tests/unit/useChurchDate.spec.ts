// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { churchDateFormatter, useChurchDate } from '~/composables/useChurchDate'
import { useSettingsStore } from '~/stores/settings'

beforeEach(() => setActivePinia(createPinia()))

describe('church dates', () => {
  it('formats the church wall clock and calendar day', () => {
    const f = churchDateFormatter('Asia/Vladivostok')
    expect(f.formatTime('2026-10-01T01:30:00Z')).toBe('11:30')
    expect(f.formatDate('2026-10-01T15:30:00Z')).toBe('2 окт. 2026 г.')
    expect(churchDateFormatter('Europe/Moscow').formatDateTime('2026-10-01T07:05:00Z')).toBe('1 окт. 2026 г., 10:05')
  })

  it('knows today across the international date line', () => {
    expect(churchDateFormatter('Pacific/Auckland', () => new Date('2026-10-01T11:30:00Z')).todayInChurch()).toBe('2026-10-02')
  })

  it('keeps existing formatter methods reactive to loaded or changed settings', () => {
    const f = useChurchDate()
    const settings = useSettingsStore()
    expect(f.formatTime('2026-10-01T01:30:00Z')).toBe('01:30')
    settings.timezone = 'Asia/Vladivostok'
    expect(f.formatTime('2026-10-01T01:30:00Z')).toBe('11:30')
  })
})

describe('human dates', () => {
  const now = () => new Date('2026-11-17T06:20:00Z')
  const cases = (zone: string) => {
    const f = churchDateFormatter('Europe/Moscow', now)
    describe(`process zone ${zone}`, () => {
      const originalTz = process.env.TZ
      beforeEach(() => { process.env.TZ = zone })
      afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

      it('formats moments', () => {
        expect(f.formatMoment('2026-11-17T06:20:00Z')).toBe('09:20')
        expect(f.formatMoment('2026-11-16T18:40:00Z')).toBe('вчера, 21:40')
        expect(f.formatMoment('2026-11-11T18:40:00Z')).toBe('ср, 21:40')
        expect(f.formatMoment('2026-11-10T18:40:00Z')).toBe('10 ноября')
        expect(f.formatMoment('2025-11-13T10:00:00Z')).toBe('13 ноября 2025')
      })

      it('formats future moments by church days', () => {
        expect(f.formatMoment('2026-11-17T20:00:00Z')).toBe('23:00')
        expect(f.formatMoment('2026-11-18T01:00:00Z')).toBe('завтра, 04:00')
        expect(f.formatMoment('2026-11-20T18:40:00Z')).toBe('пт, 21:40')
        expect(f.formatMoment('2026-11-23T18:40:00Z')).toBe('пн, 21:40')
        expect(f.formatMoment('2026-11-24T17:00:00Z')).toBe('24 ноября, 20:00')
        expect(f.formatMoment('2027-01-05T17:00:00Z')).toBe('5 января 2027, 20:00')
        expect(f.formatMoment('2026-11-17T06:21:00Z')).toBe('09:21')
      })

      it('formats full moments always with time', () => {
        expect(f.formatMomentFull('2026-11-17T06:20:00Z')).toBe('сегодня, 09:20')
        expect(f.formatMomentFull('2026-11-16T18:40:00Z')).toBe('вчера, 21:40')
        expect(f.formatMomentFull('2026-11-13T18:40:00Z')).toBe('13 ноября, 21:40')
        expect(f.formatMomentFull('2025-11-13T18:40:00Z')).toBe('13 ноября 2025, 21:40')
        expect(f.formatMomentFull('2026-11-18T01:00:00Z')).toBe('18 ноября, 04:00')
      })

      it('counts days by the church calendar around midnight', () => {
        expect(f.formatMoment('2026-11-16T21:00:00Z')).toBe('00:00')
        expect(f.formatMoment('2026-11-16T20:59:00Z')).toBe('вчера, 23:59')
      })

      it('formats events', () => {
        expect(f.formatEventWhen('2026-11-22T08:00:00Z', '2026-11-22T10:00:00Z')).toBe('Вс, 22 ноября · 11:00–13:00')
        expect(f.formatEventWhen('2026-11-21T20:00:00Z', '2026-11-21T22:30:00Z')).toBe('21–22 ноября · сб 23:00 – вс 01:30')
        expect(f.formatEventWhen('2026-12-04T15:00:00Z', '2026-12-06T13:00:00Z')).toBe('4–6 декабря · пт 18:00 – вс 16:00')
        expect(f.formatEventWhen('2026-11-30T09:00:00Z', '2026-12-02T09:00:00Z')).toBe('30 ноября – 2 декабря · пн 12:00 – ср 12:00')
        expect(f.formatEventWhen('2026-12-31T18:00:00Z', '2027-01-01T09:00:00Z')).toBe('31 декабря 2026 – 1 января 2027 · чт 21:00 – пт 12:00')
        expect(f.formatEventWhen('2027-03-06T08:00:00Z', '2027-03-06T10:00:00Z')).toBe('Сб, 6 марта 2027 · 11:00–13:00')
      })

      it('formats durations', () => {
        expect(f.formatDuration('2026-11-22T08:00:00Z', '2026-11-22T10:00:00Z')).toBe('2 ч')
        expect(f.formatDuration('2026-11-22T08:00:00Z', '2026-11-22T09:30:00Z')).toBe('1 ч 30 мин')
        expect(f.formatDuration('2026-11-22T08:00:00Z', '2026-11-22T08:45:00Z')).toBe('45 мин')
      })

      it('formats the short weekday in the church zone', () => {
        expect(f.formatWeekdayShort('2026-11-22T08:00:00Z')).toBe('вс')
      })

      it('formats day headings', () => {
        expect(f.formatDayHeading('2026-11-17')).toBe('Сегодня · вторник')
        expect(f.formatDayHeading('2026-11-18')).toBe('Завтра · среда, 18 ноября')
        expect(f.formatDayHeading('2026-11-16')).toBe('Вчера · понедельник, 16 ноября')
        expect(f.formatDayHeading('2026-11-19')).toBe('Четверг, 19 ноября')
        expect(f.formatDayHeading('2027-01-05')).toBe('Вторник, 5 января 2027')
      })

      it('compares device and church offsets at the instant', () => {
        expect(f.deviceZoneDiffers('2026-11-17T06:20:00Z')).toBe(zone !== 'Europe/Moscow')
      })
    })
  }
  cases('America/Los_Angeles')
  cases('Europe/Moscow')
  cases('Pacific/Auckland')

  it('compares offsets rather than zone names, and follows daylight saving', () => {
    const prev = process.env.TZ
    try {
      process.env.TZ = 'Europe/Minsk'
      expect(churchDateFormatter('Europe/Moscow').deviceZoneDiffers('2026-11-17T06:20:00Z')).toBe(false)
      process.env.TZ = 'Europe/London'
      const f = churchDateFormatter('Europe/London')
      expect(f.deviceZoneDiffers('2026-07-01T10:00:00Z')).toBe(false)
      process.env.TZ = 'UTC'
      expect(f.deviceZoneDiffers('2026-07-01T10:00:00Z')).toBe(true)
      expect(f.deviceZoneDiffers('2026-12-01T10:00:00Z')).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev
    }
  })

  it('is exposed through useChurchDate with the current time', () => {
    const f = useChurchDate()
    expect(f.formatMoment(new Date().toISOString())).toMatch(/^\d{2}:\d{2}$/)
    expect(f.formatDayHeading(f.todayInChurch())).toMatch(/^Сегодня · /)
    expect(typeof f.formatEventWhen).toBe('function')
    expect(typeof f.formatDuration).toBe('function')
    expect(typeof f.deviceZoneDiffers).toBe('function')
  })
})
