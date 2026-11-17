import { churchLocalToUtc, utcToChurchLocal } from '~/utils/churchWallTime'

const DAY_MS = 86_400_000

export function churchDateFormatter(timeZone: string, now: () => Date = () => new Date()) {
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'short', year: 'numeric' })
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' })
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const numeric = new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const weekdayShort = new Intl.DateTimeFormat('ru-RU', { timeZone, weekday: 'short' })
  const dayMonth = new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'long' })
  const wall = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  // Дата без времени (ГГГГ-ММ-ДД) показываем в UTC: пояс церкви здесь уже учтён.
  const plainDayMonth = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' })
  const plainWeekday = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long' })
  const plainWeekdayShort = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short' })
  const plainMonthYear = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' })

  const dayKey = (value: Date | string) => iso.format(typeof value === 'string' ? new Date(value) : value)
  const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY_MS)
  const yearOf = (key: string) => key.slice(0, 4)
  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
  const daysAgo = (key: string) => dayNumber(dayKey(now())) - dayNumber(key)
  const withYear = (text: string, key: string) => yearOf(key) === yearOf(dayKey(now())) ? text : `${text} ${yearOf(key)}`
  const dayPart = (value: Date, key: string) => withYear(dayMonth.format(value), key)

  const offsetMinutes = (instant: Date) => {
    const p = Object.fromEntries(wall.formatToParts(instant).map(part => [part.type, Number(part.value)]))
    const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
    return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
  }

  const formatMoment = (value: string) => {
    const at = new Date(value)
    const key = dayKey(at)
    const ago = daysAgo(key)
    if (ago === 0) return time.format(at)
    if (ago === 1) return `вчера, ${time.format(at)}`
    if (ago === -1) return `завтра, ${time.format(at)}`
    if ((ago >= 2 && ago <= 6) || (ago <= -2 && ago >= -6)) return `${weekdayShort.format(at)}, ${time.format(at)}`
    return ago < 0 ? `${dayPart(at, key)}, ${time.format(at)}` : dayPart(at, key)
  }

  // Всегда со временем: журнал, последняя активность устройства.
  const formatMomentFull = (value: string) => {
    const at = new Date(value)
    const key = dayKey(at)
    const ago = daysAgo(key)
    if (ago === 0) return `сегодня, ${time.format(at)}`
    if (ago === 1) return `вчера, ${time.format(at)}`
    return `${dayPart(at, key)}, ${time.format(at)}`
  }

  const formatEventWhen = (startIso: string, endIso: string) => {
    const start = new Date(startIso)
    const end = new Date(endIso)
    const startKey = dayKey(start)
    // Событие, закончившееся ровно в полночь, остаётся в своём дне.
    const lastKey = end > start ? dayKey(new Date(end.getTime() - 1)) : startKey
    if (startKey === lastKey) {
      return `${capitalize(weekdayShort.format(start))}, ${dayPart(start, startKey)} · ${time.format(start)}–${time.format(end)}`
    }
    const endDay = new Date(end.getTime() - 1)
    const [sy, sm] = startKey.split('-')
    const [ey, em] = lastKey.split('-')
    let range: string
    if (sy !== ey) {
      range = `${dayMonth.format(start)} ${sy} – ${dayMonth.format(endDay)} ${ey}`
    } else if (sm !== em) {
      range = withYear(`${dayMonth.format(start)} – ${dayMonth.format(endDay)}`, startKey)
    } else {
      const startDay = dayMonth.format(start).split(' ')[0]
      range = withYear(`${startDay}–${dayMonth.format(endDay)}`, startKey)
    }
    return `${range} · ${weekdayShort.format(start)} ${time.format(start)} – ${weekdayShort.format(endDay)} ${time.format(end)}`
  }

  const formatDuration = (startIso: string, endIso: string) => {
    const minutes = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000))
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m} мин`
    return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
  }

  // Заголовок дня без относительных слов: «Вторник, 17 ноября»; год — только не текущий.
  const formatDayTitle = (dateOnly: string) => {
    const at = new Date(`${dateOnly}T00:00:00Z`)
    return `${capitalize(plainWeekday.format(at))}, ${withYear(plainDayMonth.format(at), dateOnly)}`
  }

  const formatDayHeading = (dateOnly: string) => {
    const at = new Date(`${dateOnly}T00:00:00Z`)
    const weekday = plainWeekday.format(at)
    const full = withYear(plainDayMonth.format(at), dateOnly)
    const ago = daysAgo(dateOnly)
    if (ago === 0) return `Сегодня · ${weekday}`
    if (ago === -1) return `Завтра · ${weekday}, ${full}`
    if (ago === 1) return `Вчера · ${weekday}, ${full}`
    return formatDayTitle(dateOnly)
  }

  // Название месяца в календаре: «Ноябрь 2026», без «г.».
  const formatMonthTitle = (dateOnly: string) => capitalize(plainMonthYear.format(new Date(`${dateOnly}T00:00:00Z`)).replace(/\s*г\.$/, ''))

  // Разделитель дня в чате: «Сегодня», «Вчера», «Пт, 13 ноября» (год — только не текущий).
  const formatChatDay = (dateOnly: string) => {
    const ago = daysAgo(dateOnly)
    if (ago === 0) return 'Сегодня'
    if (ago === 1) return 'Вчера'
    const at = new Date(`${dateOnly}T00:00:00Z`)
    return `${capitalize(plainWeekdayShort.format(at))}, ${withYear(plainDayMonth.format(at), dateOnly)}`
  }

  const deviceZoneDiffers = (value: string) => {
    const at = new Date(value)
    return -at.getTimezoneOffset() !== offsetMinutes(at)
  }

  return {
    formatDate: (value: string) => date.format(new Date(value)),
    formatTime: (value: string) => time.format(new Date(value)),
    formatDateTime: (value: string) => `${date.format(new Date(value))}, ${time.format(new Date(value))}`,
    todayInChurch: () => iso.format(now()),
    formatNumericDateTime: (value: string) => numeric.format(new Date(value)),
    formatMoment,
    formatMomentFull,
    formatEventWhen,
    formatDuration,
    formatDayHeading,
    formatDayTitle,
    formatMonthTitle,
    formatChatDay,
    formatWeekdayShort: (value: string) => weekdayShort.format(new Date(value)),
    deviceZoneDiffers,
  }
}

export function useChurchDate() {
  const settings = useSettingsStore()
  const formatter = computed(() => churchDateFormatter(settings.timezone))
  return {
    toUtcIso: (local: string) => churchLocalToUtc(local, settings.timezone),
    toLocalInput: (iso: string) => utcToChurchLocal(iso, settings.timezone),
    formatDate: (iso: string) => formatter.value.formatDate(iso),
    formatTime: (iso: string) => formatter.value.formatTime(iso),
    formatDateTime: (iso: string) => formatter.value.formatDateTime(iso),
    todayInChurch: () => formatter.value.todayInChurch(),
    formatMoment: (iso: string) => formatter.value.formatMoment(iso),
    formatMomentFull: (iso: string) => formatter.value.formatMomentFull(iso),
    formatEventWhen: (startIso: string, endIso: string) => formatter.value.formatEventWhen(startIso, endIso),
    formatDuration: (startIso: string, endIso: string) => formatter.value.formatDuration(startIso, endIso),
    formatDayHeading: (dateOnly: string) => formatter.value.formatDayHeading(dateOnly),
    formatDayTitle: (dateOnly: string) => formatter.value.formatDayTitle(dateOnly),
    formatMonthTitle: (dateOnly: string) => formatter.value.formatMonthTitle(dateOnly),
    formatChatDay: (dateOnly: string) => formatter.value.formatChatDay(dateOnly),
    formatWeekdayShort: (iso: string) => formatter.value.formatWeekdayShort(iso),
    deviceZoneDiffers: (iso: string) => formatter.value.deviceZoneDiffers(iso),
  }
}
