import { addCalendarDays, calendarWeekStart } from './useEvents'
import type { EventRange } from './useEvents'

export type CalendarView = { date: string, view: 'month' | 'list', scope: string }
type CalendarQuery = Record<string, unknown>
export function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' && value <= '9998-12-31' && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
}
export function readCalendarQuery(query: CalendarQuery, today: string, defaultView: CalendarView['view'], scope = 'church', visibleScopes: string[] = []): CalendarView {
  const allowed = scope === 'church' ? ['church', 'mine', ...visibleScopes] : [scope]
  return { date: isCalendarDate(query.date) ? query.date : today, view: query.view === 'month' || query.view === 'list' ? query.view : defaultView, scope: typeof query.scope === 'string' && allowed.includes(query.scope) ? query.scope : scope }
}
export function calendarQuery(value: CalendarView): Record<string, string> { return { date: value.date, view: value.view, scope: value.scope } }
export function calendarRange(value: CalendarView): EventRange {
  const from = value.date.slice(0, 7) + '-01'
  const last = new Date(from + 'T00:00:00Z'); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0)
  const to = last.toISOString().slice(0, 10)
  return value.view === 'month' ? { from: calendarWeekStart(from), to: addCalendarDays(calendarWeekStart(to), 6) } : { from, to }
}
export function shiftCalendarMonth(value: string, delta: number): string {
  const date = new Date(value + 'T00:00:00Z'), day = date.getUTCDate()
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + delta)
  const last = new Date(date); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0)
  date.setUTCDate(Math.min(day, last.getUTCDate()))
  const result = date.toISOString().slice(0, 10)
  return isCalendarDate(result) ? result : value
}
export function safeCalendarReturn(value: unknown): string {
  if (typeof value !== 'string') return '/calendar'
  const match = /^(\/calendar|\/ministries\/([A-Za-z0-9_-]+)\/events)\?([^#]+)$/.exec(value)
  if (!match) return '/calendar'
  const params = new URLSearchParams(match[3]), query = Object.fromEntries(params)
  if ([...params.keys()].length !== 3 || !isCalendarDate(query.date) || !['month', 'list'].includes(query.view ?? '') || Object.keys(query).some(key => !['date', 'view', 'scope'].includes(key))) return '/calendar'
  if (match[2] ? query.scope !== `ministry:${match[2]}` : !['church', 'mine'].includes(query.scope ?? '') && !/^ministry:[A-Za-z0-9_-]+$/.test(query.scope ?? '')) return '/calendar'
  return match[1] + '?' + new URLSearchParams(calendarQuery(query as CalendarView))
}
export function useCalendarView(scope: string | (() => string) = 'church', visibleScopes: () => string[] = () => []) {
  const route = useRoute(), router = useRouter(), { todayInChurch } = useChurchDate()
  const defaultView = (): CalendarView['view'] => import.meta.client && window.matchMedia('(min-width: 1024px)').matches ? 'month' : 'list'
  const state = ref<CalendarView | null>(null)
  const range = computed(() => state.value ? calendarRange(state.value) : null)
  const baseScope = () => typeof scope === 'function' ? scope() : scope
  function initialize() { state.value = readCalendarQuery(route.query, todayInChurch(), defaultView(), baseScope(), visibleScopes()) }
  function update(change: Partial<CalendarView>) {
    if (!state.value) return
    const value = readCalendarQuery({ ...state.value, ...change }, state.value.date, state.value.view, baseScope(), visibleScopes())
    if (!isCalendarDate(value.date)) return
    state.value = value
    void router.replace({ path: route.path, query: calendarQuery(value) })
  }
  watch(() => route.query, () => { if (state.value) initialize() })
  const returnContext = computed(() => state.value ? safeCalendarReturn(route.path + '?' + new URLSearchParams(calendarQuery(state.value))) : '/calendar')
  return { state, range, initialize, update, returnContext, today: () => update({ date: todayInChurch() }), move: (delta: number) => { if (state.value) update({ date: shiftCalendarMonth(state.value.date, delta) }) } }
}
