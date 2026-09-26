// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { churchDayEndToUtc, churchDayStartToUtc, formatChurchDateTime } from '~/utils/churchTime'

// Оба пояса ниже выбраны заведомо не совпадающими с поясом машины CI (обычно
// UTC): проверка тем самым доказывает, что функции применяют переданный
// часовой пояс, а не пояс окружения, где запущен тест.
describe('formatChurchDateTime', () => {
  it('shows the church-timezone wall clock, not the UTC one', () => {
    // 23:30 UTC 1 января — в Кирибати (UTC+14) это уже 13:30 2 января.
    expect(formatChurchDateTime('2026-01-01T23:30:00Z', 'Pacific/Kiritimati')).toBe('02.01.2026, 13:30')
  })

  it('shows a different wall clock for a different timezone, same instant', () => {
    // Тот же момент в Мидуэе (UTC-11) — 12:30 всё ещё 1 января.
    expect(formatChurchDateTime('2026-01-01T23:30:00Z', 'Pacific/Midway')).toBe('01.01.2026, 12:30')
  })
})

describe('church day boundaries for the audit period filter', () => {
  // Екатеринбург: UTC+5 круглый год (без перевода стрелок) — граница суток
  // предсказуема и легко проверяется вручную.
  const timeZone = 'Asia/Yekaterinburg'

  it('converts the start of a church-timezone day to UTC', () => {
    expect(churchDayStartToUtc('2026-09-12', timeZone)).toBe('2026-09-11T19:00:00.000Z')
  })

  it('converts the end of a church-timezone day (inclusive) to the instant before the next one', () => {
    expect(churchDayEndToUtc('2026-09-13', timeZone)).toBe('2026-09-13T18:59:59.999Z')
  })

  it('keeps an entry created at the last millisecond of the church day inside an inclusive range', () => {
    const to = churchDayEndToUtc('2026-09-13', timeZone)
    const lastMomentOfTheDay = new Date('2026-09-13T18:59:59.999Z')

    expect(new Date(to).getTime()).toBeGreaterThanOrEqual(lastMomentOfTheDay.getTime())
    // А первая миллисекунда следующего дня в границу уже не попадает.
    expect(new Date(to).getTime()).toBeLessThan(new Date('2026-09-13T19:00:00.000Z').getTime())
  })
})
