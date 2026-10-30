import type { components } from '~~/types/api'
export type EventItem = components['schemas']['EventResource']
export type EventSlot = components['schemas']['EventSlotResource']
export type EventRange = { from: string, to: string }
export type EventListResponse = { data: EventItem[], meta: { current_page: number, last_page: number, total: number } }

// Civil date labels are deliberately manipulated/formatted in UTC: they are
// already church dates, not instants to convert through a second timezone.
export function addCalendarDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function calendarWeekStart(dateOnly: string): string {
  const day = new Date(`${dateOnly}T00:00:00Z`).getUTCDay()
  return addCalendarDays(dateOnly, -((day + 6) % 7))
}
export function formatCalendarDay(dateOnly: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${dateOnly}T00:00:00Z`))
}
export function groupByChurchDay(events: EventItem[], timeZone: string): { day: string, events: EventItem[] }[] {
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const groups = new Map<string, EventItem[]>()
  for (const event of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id))) {
    const day = formatter.format(new Date(event.starts_at))
    groups.set(day, [...(groups.get(day) ?? []), event])
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, events: items }))
}
export function useEvents() {
  const api = useApi(), auth = useAuthStore(), settings = useSettingsStore()
  async function load(range: EventRange, scope: string): Promise<EventItem[]> {
    const session = auth.sessionVersion
    const items = new Map<string, EventItem>()
    let page = 1
    let lastPage: number
    do {
      if (session !== auth.sessionVersion) throw new Error('Session changed')
      const result = await api.get<EventListResponse>('/events', { ...range, scope, page, per_page: 200 })
      if (session !== auth.sessionVersion) throw new Error('Session changed')
      for (const item of result.data) items.set(item.id, item)
      lastPage = result.meta.last_page
      page++
    } while (page <= lastPage)
    return [...items.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id))
  }
  return { load, groupByChurchDay: (events: EventItem[]) => groupByChurchDay(events, settings.timezone) }
}
