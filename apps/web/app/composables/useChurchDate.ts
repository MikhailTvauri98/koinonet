import { churchLocalToUtc, utcToChurchLocal } from '~/utils/churchWallTime'
export function churchDateFormatter(timeZone: string, now: () => Date = () => new Date()) {
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'short', year: 'numeric' })
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' })
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const numeric = new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return {
    formatDate: (value: string) => date.format(new Date(value)),
    formatTime: (value: string) => time.format(new Date(value)),
    formatDateTime: (value: string) => `${date.format(new Date(value))}, ${time.format(new Date(value))}`,
    todayInChurch: () => iso.format(now()),
    formatNumericDateTime: (value: string) => numeric.format(new Date(value)),
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
  }
}
