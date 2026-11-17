// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { churchLocalToUtc, utcToChurchLocal } from '~/utils/churchWallTime'
import { DURATION_PRESETS, durationPresetLabel, endFromPreset, isAmbiguousChurchTime } from '~/utils/eventEditor'
describe('church wall time', () => {
  it('uses date-specific offsets and preserves seconds', () => {
    expect(churchLocalToUtc('2026-01-07T18:01:23', 'Europe/Berlin')).toBe('2026-01-07T17:01:23.000Z')
    expect(churchLocalToUtc('2026-07-07T18:01', 'Europe/Berlin')).toBe('2026-07-07T16:01:00.000Z')
    expect(utcToChurchLocal('2026-01-07T17:01:23Z', 'Europe/Berlin')).toBe('2026-01-07T18:01:23')
  })
  it('rejects invalid dates and DST gaps, chooses earlier repeated hour', () => {
    expect(() => churchLocalToUtc('2026-02-30T12:00', 'Europe/Berlin')).toThrow()
    expect(() => churchLocalToUtc('2026-03-29T02:30', 'Europe/Berlin')).toThrow()
    expect(churchLocalToUtc('2026-10-25T02:30', 'Europe/Berlin')).toBe('2026-10-25T00:30:00.000Z')
  })
})


it('does not use the device zone when converting church input', () => {
  const original = process.env.TZ
  try {
    for (const zone of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
      process.env.TZ = zone
      expect(churchLocalToUtc('2026-07-07T18:01:23', 'Europe/Berlin')).toBe('2026-07-07T16:01:23.000Z')
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
})

describe('event editor time helpers', () => {
  it('lists presets with Russian labels', () => {
    expect(DURATION_PRESETS.map(durationPresetLabel)).toEqual(['1 ч', '1,5 ч', '2 ч', '3 ч'])
  })
  it('computes the end across midnight in the church zone', () => {
    expect(endFromPreset('2026-12-31', '23:00', 90, 'Europe/Berlin')).toEqual({ date: '2027-01-01', time: '00:30' })
    expect(endFromPreset('2026-07-07', '18:00:23', 60, 'Europe/Berlin')).toEqual({ date: '2026-07-07', time: '19:00:23' })
  })
  it('adds real elapsed time over a DST transition', () => {
    expect(endFromPreset('2026-10-25', '01:30', 120, 'Europe/Berlin')).toEqual({ date: '2026-10-25', time: '02:30' })
    expect(endFromPreset('2026-03-28', '23:30', 180, 'Europe/Berlin')).toEqual({ date: '2026-03-29', time: '03:30' })
  })
  it('keeps start plus preset exact across the repeated hour, which the wall time alone cannot', () => {
    const start = Date.parse(churchLocalToUtc('2026-10-25T01:30', 'Europe/Berlin'))
    expect(endFromPreset('2026-10-25', '01:30', 120, 'Europe/Berlin')).toEqual({ date: '2026-10-25', time: '02:30' })
    expect(churchLocalToUtc('2026-10-25T02:30', 'Europe/Berlin')).toBe(new Date(start + 3600000).toISOString())
    expect(Date.parse(churchLocalToUtc('2026-10-25T02:30', 'Europe/Berlin')) - start).not.toBe(120 * 60000)
  })
  it('flags only wall times that occur twice', () => {
    expect(isAmbiguousChurchTime('2026-10-25', '02:30', 'Europe/Berlin')).toBe(true)
    expect(isAmbiguousChurchTime('2026-10-25', '03:30', 'Europe/Berlin')).toBe(false)
    expect(isAmbiguousChurchTime('2026-03-29', '02:30', 'Europe/Berlin')).toBe(false)
    expect(isAmbiguousChurchTime('2026-10-25', '', 'Europe/Berlin')).toBe(false)
    for (const time of ['00:30', '02:30', '12:00']) expect(isAmbiguousChurchTime('2026-10-25', time, 'Europe/Moscow')).toBe(false)
  })
})
