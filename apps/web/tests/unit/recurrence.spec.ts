import { describe, expect, it } from 'vitest'
import { recurrenceLabel } from '~/utils/recurrence'

describe('recurrenceLabel', () => {
  it.each([
    [null, 'Без повторения'],
    [{ type: 'weekly', weekday: 7 }, 'Каждое воскресенье'],
    [{ type: 'weekly', weekday: 3 }, 'Каждую среду'],
    [{ type: 'biweekly', weekday: 6, anchor_date: '2026-11-07' }, 'Раз в две недели по субботам'],
    [{ type: 'monthly_nth_weekday', weekday: 2, nth: 2 }, 'Второй вторник месяца'],
    [{ type: 'monthly_nth_weekday', weekday: 5, nth: -1 }, 'Последняя пятница месяца'],
    [{ type: 'monthly_nth_weekday', weekday: 7, nth: 5 }, 'Пятое воскресенье месяца'],
  ] as const)('describes %j in Russian', (rule, label) => {
    expect(recurrenceLabel(rule)).toBe(label)
  })
})
