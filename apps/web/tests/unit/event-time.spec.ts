// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { churchLocalToUtc, utcToChurchLocal } from '~/utils/churchWallTime'
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
