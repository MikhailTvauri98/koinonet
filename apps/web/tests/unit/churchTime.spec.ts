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

// Ревью task-30: `startOfDayInTimeZone` брала смещение пояса в момент "дата,
// прочитанная как UTC" — приближение, которое путает соседние дни всякий
// раз, когда этот момент оказывается по другую сторону перевода стрелок от
// настоящей местной полуночи. Ревьюер прогнал старый алгоритм по всем дням
// 2026 года и нашёл конкретные пары пояс/дата, где граница сдвигается на
// час (иногда на полчаса) — ниже они и проверяются впрямую, а не только
// свойством "не совпадает с UTC" (которое перевод стрелок не задевает).
describe('church day boundaries across a DST transition', () => {
  // Локальная дата момента — независимо от churchTime.ts, тем же способом,
  // которым ревьюер и нашёл баг: спросить Intl напрямую, а не то, что
  // возвращает сама проверяемая функция.
  function localDate(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  }

  // Определение решения контроллера: начало суток — первый момент, чья
  // местная дата равна заданной. Проверка не завязана на конкретный час:
  // сам результат должен иметь искомую дату, а момент на 1 мс раньше —
  // уже предыдущую. Одна и та же проверка покрывает и обычную полночь, и
  // пропущенную (see 'skips local midnight entirely' ниже) без разбора случаев.
  function expectFirstMomentOfTheDay(dateOnly: string, timeZone: string) {
    const start = churchDayStartToUtc(dateOnly, timeZone)
    const oneMsBefore = new Date(new Date(start).getTime() - 1).toISOString()

    expect(localDate(start, timeZone)).toBe(dateOnly)
    expect(localDate(oneMsBefore, timeZone) < dateOnly).toBe(true)
  }

  it.each([
    ['Pacific/Auckland', '2026-04-05'], // конец летнего времени, сдвиг на час назад
    ['Pacific/Auckland', '2026-09-27'], // начало летнего времени, сдвиг на час вперёд
    ['Australia/Sydney', '2026-04-05'],
    ['Australia/Sydney', '2026-10-04'],
    ['America/Santiago', '2026-04-05'],
    ['America/Santiago', '2026-09-06'],
    ['Asia/Gaza', '2026-03-28'],
    ['Asia/Gaza', '2026-10-24'],
    ['Australia/Lord_Howe', '2026-04-05'], // сдвиг на полчаса, не на час
    ['Australia/Lord_Howe', '2026-10-04'],
    ['Pacific/Chatham', '2026-04-05'],
    ['Pacific/Chatham', '2026-09-27'],
  ])('finds the true first moment of %s on the transition day %s', (timeZone, dateOnly) => {
    expectFirstMomentOfTheDay(dateOnly, timeZone)
  })

  it('uses the first existing local moment when the transition skips local midnight entirely', () => {
    // America/Santiago переводит стрелки ровно в полночь (решение о переходе
    // "в 24:00 официального времени"): 5 сентября 23:59:59 сразу сменяется
    // 6 сентября 01:00:00 — местных 00:00:00 6 сентября не существует.
    const start = churchDayStartToUtc('2026-09-06', 'America/Santiago')
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(start))

    expect(localDate(start, 'America/Santiago')).toBe('2026-09-06')
    expect(localTime).not.toBe('00:00')
  })

  it('keeps computing an ordinary midnight for a zone without any DST transition', () => {
    // Контроль: без перевода стрелок функция не должна была сломаться этим
    // исправлением — тот же Екатеринбург, что и в тестах выше, той же общей
    // проверкой, что и переходные дни.
    expectFirstMomentOfTheDay('2026-04-05', 'Asia/Yekaterinburg')
  })

  it('keeps the end of a transition day exactly one millisecond before the start of the next one', () => {
    // Ни дыры, ни перекрытия между соседними днями на границе перевода стрелок.
    const end = churchDayEndToUtc('2026-04-05', 'Pacific/Auckland')
    const nextStart = churchDayStartToUtc('2026-04-06', 'Pacific/Auckland')

    expect(new Date(nextStart).getTime() - new Date(end).getTime()).toBe(1)
  })
})
