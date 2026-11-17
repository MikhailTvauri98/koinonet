// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarPage from '~/pages/calendar.vue'
import EventPage from '~/pages/events/[id].vue'
import EventCard from '~/components/calendar/EventCard.vue'
import SlotList from '~/components/calendar/SlotList.vue'
import CancelEventDialog from '~/components/calendar/CancelEventDialog.vue'
import type { EventItem } from '~/composables/useEvents'
import { useSettingsStore } from '~/stores/settings'
import { useAuthStore } from '~/stores/auth'
import { grantPermissions } from '../support/permissions'
import { useRouter } from '#app'

const get = vi.fn()
const patch = vi.fn(), post = vi.fn()
const { routeQuery, replace } = vi.hoisted(() => ({ routeQuery: {} as Record<string, string>, replace: vi.fn().mockResolvedValue(undefined) }))
mockNuxtImport('useApi', () => () => ({ get, patch, post }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'e1' }, path: '/calendar', query: routeQuery }))
enableAutoUnmount(afterEach)
const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1', chat_id: null, owner_type: 'church', ministry: null, template_id: null, occurrence_date: null,
  title: 'Воскресное служение', description: 'Описание события', location: 'Зал',
  starts_at: '2026-11-08T07:00:00Z', ends_at: '2026-11-08T09:00:00Z', visibility: 'church', status: 'scheduled',
  cancelled_at: null, cancel_reason: null, can_manage: false, attachments: [],
  slots: [{ id: 's1', label: 'Вокалист', resource_type: 'person', role: null, required_count: 2, filled_count: 3, sort_order: 0, can_fill: false, assignments: [] }], ...over,
})
const list = (items: EventItem[]) => ({ data: items, meta: { current_page: 1, last_page: 1, total: items.length } })
beforeEach(() => {
  get.mockReset(); post.mockReset(); patch.mockReset(); replace.mockClear(); Object.keys(routeQuery).forEach(key => Reflect.deleteProperty(routeQuery, key)); grantPermissions()
  vi.spyOn(useRouter(), 'replace').mockImplementation(replace)
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Asia/Vladivostok' } as never)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-08T20:30:00Z'))
})
afterEach(() => vi.useRealTimers())
describe('calendar page', () => {
  it('requests the entire visible month, switches scopes and crosses the year without losing context', async () => {
    Object.assign(routeQuery, { date: '2026-12-31', view: 'month' })
    get.mockResolvedValue(list([event()]))
    const page = await mountSuspended(CalendarPage)
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ from: '2026-11-30', to: '2027-01-03', scope: 'church' }))
    await page.get('[data-test="scope-mine"]').trigger('click'); await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/events', expect.objectContaining({ scope: 'mine' }))
    await page.get('[data-test="next-month"]').trigger('click'); await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/events', expect.objectContaining({ from: '2026-12-28', to: '2027-01-31', scope: 'mine' }))
    expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ query: expect.objectContaining({ date: '2027-01-31', view: 'month', scope: 'mine' }) }))
    await page.get('[data-test="calendar-today"]').trigger('click'); await flushPromises()
    expect(page.get('[data-test="calendar-date"]').element).toHaveProperty('value', '2026-11-09')
  })
  it('keeps western date-only headers on their chosen day', async () => {
    routeQuery.view = 'list'
    useSettingsStore().timezone = 'America/Los_Angeles'; get.mockResolvedValue(list([event({ starts_at: '2026-11-09T02:00:00Z' })]))
    const page = await mountSuspended(CalendarPage)
    expect(page.text()).toContain('8 ноября')
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ from: '2026-11-01', to: '2026-11-30' }))
  })
  it('ignores stale scope responses', async () => {
    get.mockResolvedValueOnce(list([]))
    const page = await mountSuspended(CalendarPage)
    let old!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise(resolve => { old = resolve })).mockResolvedValueOnce(list([event({ title: 'Актуальное', starts_at: '2026-12-09T07:00:00Z', ends_at: '2026-12-09T09:00:00Z' })]))
    await page.get('[data-test="next-month"]').trigger('click')
    await flushPromises()
    await page.get('[data-test="scope-mine"]').trigger('click'); await flushPromises()
    old(list([event({ title: 'Устаревшее' })])); await flushPromises()
    expect(page.text()).toContain('Актуальное'); expect(page.text()).not.toContain('Устаревшее')
  })
  it('opens every overflow event on its church day and keeps a safe return link', async () => {
    Object.assign(routeQuery, { date: '2026-11-09', view: 'month', scope: 'mine' })
    const items = Array.from({ length: 4 }, (_, i) => event({ id: `e${i}`, title: `Событие ${i}`, starts_at: '2026-11-08T20:00:00Z', ends_at: '2026-11-09T20:00:00Z' }))
    get.mockResolvedValue(list(items))
    const page = await mountSuspended(CalendarPage)
    await page.get('[data-test="overflow-2026-11-09"]').trigger('click'); await flushPromises()
    const day = page.get('[data-test="selected-day"]')
    expect(day.findAll('a[href*="/events/"]')).toHaveLength(4)
    expect(day.text()).toContain('Событие 3')
    const target = new URL(day.get('a[href*="/events/"]').attributes('href')!, 'https://church.test')
    expect(target.searchParams.get('return')).toContain('/calendar?date=2026-11-09&view=month&scope=mine')
    expect(page.find('[data-test="day-2026-11-10"]').text()).toContain('Событие')
  })
  it('labels the ending day with its end time, rather than repeating the original start', async () => {
    Object.assign(routeQuery, { date: '2026-11-10', view: 'month' })
    get.mockResolvedValue(list([event({ starts_at: '2026-11-08T20:00:00Z', ends_at: '2026-11-09T20:00:00Z' })]))
    const page = await mountSuspended(CalendarPage)
    expect(page.get('[data-test="selected-day"] .event-row time').text()).toBe('До 06:00')
  })
  it('shows the chosen date first in list mode, including an explicit empty day', async () => {
    Object.assign(routeQuery, { date: '2026-11-09', view: 'list' })
    get.mockResolvedValue(list([event()]))
    const page = await mountSuspended(CalendarPage)
    await page.get('[data-test="calendar-date"]').setValue('2026-11-20'); await flushPromises()
    expect(page.get('[data-test="selected-day"]').text()).toContain('20 ноября')
    expect(page.get('[data-test="selected-day"]').text()).toContain('Событий пока нет')
  })
  it('offers only visible ministry filters and drops a revoked ministry scope', async () => {
    grantPermissions({ ministries: { m1: [] } })
    Object.assign(routeQuery, { date: '2026-11-09', view: 'list', scope: 'ministry:m1' })
    get.mockImplementation(async (path: string) => path === '/ministries' ? { data: [{ id: 'm1', name: 'Хор' }] } : list([]))
    const page = await mountSuspended(CalendarPage)
    expect(page.get('select').text()).toContain('Хор')
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ scope: 'ministry:m1' }))
    grantPermissions(); await flushPromises()
    expect(page.find('select').exists()).toBe(false)
    expect(get).toHaveBeenLastCalledWith('/events', expect.objectContaining({ scope: 'church' }))
  })
  it('shows settings failure without querying dates and retries', async () => {
    useSettingsStore().reset(); get.mockRejectedValueOnce(new Error('offline'))
    const page = await mountSuspended(CalendarPage)
    expect(page.find('[role="alert"]').exists()).toBe(true)
    expect(get.mock.calls.map(call => call[0])).toEqual(['/settings'])
    get.mockResolvedValueOnce({ data: { church_name: 'Церковь', timezone: 'Asia/Vladivostok' } }).mockResolvedValueOnce(list([]))
    await page.get('[data-test="retry-calendar"]').trigger('click'); await flushPromises()
    expect(page.text()).toContain('Событий пока нет')
  })
})
describe('calendar month cells and toolbar', () => {
  const day = '2026-11-10'
  const at = (i: number) => ({ starts_at: `2026-11-10T0${i}:00:00Z`, ends_at: `2026-11-10T0${i}:30:00Z` })
  const month = async (items: EventItem[]) => {
    Object.assign(routeQuery, { date: day, view: 'month', scope: 'church' })
    get.mockResolvedValue(list(items))
    return mountSuspended(CalendarPage)
  }
  const chips = (page: Awaited<ReturnType<typeof month>>) => page.findAll(`[data-test="day-${day}"] .calendar-month__event`)
  it('shows three events of a day, and the fourth only as an overflow count', async () => {
    const three = await month([1, 2, 3].map(i => event({ id: `e${i}`, title: `Событие ${i}`, ...at(i) })))
    expect(chips(three)).toHaveLength(3); expect(three.find(`[data-test="overflow-${day}"]`).exists()).toBe(false)
    const four = await month([1, 2, 3, 4].map(i => event({ id: `e${i}`, title: `Событие ${i}`, ...at(i) })))
    expect(chips(four)).toHaveLength(3); expect(four.get(`[data-test="overflow-${day}"]`).text()).toBe('Ещё 1')
  })
  it('marks my own assignment with visible text «Вы»', async () => {
    useAuthStore().person = { id: 'me' } as never
    const mine = event({ id: 'mine', title: 'Моё', ...at(1) }); mine.slots[0]!.assignments = [{ id: 'a1', person: { id: 'me', full_name: 'Я', short_name: 'Я', photo_thumb_url: null }, created_at: null }]
    const page = await month([mine, event({ id: 'other', title: 'Чужое', ...at(2) })])
    const [first, second] = chips(page)
    expect(first!.text()).toContain('Вы'); expect(second!.text()).not.toContain('Вы')
  })
  it('strikes cancelled events and names them as cancelled', async () => {
    const page = await month([event({ id: 'c', title: 'Отмена', status: 'cancelled', ...at(1) })])
    const chip = chips(page)[0]!
    expect(chip.classes()).toContain('is-cancelled'); expect(chip.text()).toContain('Отменено'); expect(chip.attributes('title')).toContain('Отменено')
  })
  it('takes the stripe color from the ministry and falls back to the church color', async () => {
    const page = await month([
      event({ id: 'm', title: 'Хор', ministry: { id: 'm1', name: 'Хор', color: 'teal' }, ...at(1) }),
      event({ id: 'n', title: 'Без цвета', ministry: { id: 'm2', name: 'Дети', color: null }, ...at(2) }),
      event({ id: 'c', title: 'Церковь', ...at(3) }),
    ])
    const [a, b, c] = chips(page).map(chip => chip.attributes('style'))
    expect(a).toContain('var(--ui-ministry-teal)'); expect(b).toContain('var(--ui-ministry-church)'); expect(c).toContain('var(--ui-ministry-church)')
  })
  it('lists a legend entry per visible ministry plus the church and the «Вы» marker', async () => {
    const page = await month([event({ id: 'm', ministry: { id: 'm1', name: 'Хор', color: 'teal' }, ...at(1) }), event({ id: 'n', ministry: { id: 'm1', name: 'Хор', color: 'teal' }, ...at(2) })])
    const legend = page.get('[data-test="calendar-legend"]')
    expect(legend.findAll('li').map(li => li.text())).toEqual(['Церковь', 'Хор', 'Вы — вы назначены'])
  })
  it('opens the native date picker from the month title and navigates to the chosen date', async () => {
    const page = await month([])
    const input = page.get('[data-test="calendar-date"]').element as HTMLInputElement
    const showPicker = vi.fn(); input.showPicker = showPicker
    expect(page.find('.calendar-toolbar input[type="date"]').exists()).toBe(true)
    await page.get('[data-test="calendar-month-button"]').trigger('click')
    expect(showPicker).toHaveBeenCalled()
    await page.get('[data-test="calendar-date"]').setValue('2027-01-20'); await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/events', expect.objectContaining({ from: '2026-12-28', to: '2027-01-31' }))
    expect(page.get('[data-test="selected-day"]').text()).toContain('20 января')
  })
  it('falls back to focusing the date field when showPicker is unavailable', async () => {
    const page = await month([])
    const input = page.get('[data-test="calendar-date"]').element as HTMLInputElement
    Reflect.deleteProperty(input, 'showPicker'); const focus = vi.spyOn(input, 'focus')
    await page.get('[data-test="calendar-month-button"]').trigger('click')
    expect(focus).toHaveBeenCalled()
  })
  it('shows the church time zone only when the device zone differs', async () => {
    const page = await month([])
    const differs = new Date('2026-11-10T12:00:00Z').getTimezoneOffset() !== -600
    expect(page.find('.calendar-zone').exists()).toBe(differs)
    if (differs) expect(page.get('.calendar-zone').text()).toContain('Asia/Vladivostok')
    useSettingsStore().timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; await flushPromises()
    expect(page.find('.calendar-zone').exists()).toBe(false)
  })
  it('puts the create action last in the toolbar for users who can create, with the selected day and return context', async () => {
    grantPermissions({ global: ['calendar.church.manage'] })
    const page = await month([])
    const link = page.get('[data-test="toolbar-create"]')
    expect(link.text()).toContain('Событие'); expect(link.attributes('aria-label')).toBe('Создать событие')
    expect(page.get('.calendar-toolbar').element.lastElementChild).toBe(link.element)
    expect(page.find('header a[href*="/events/new"]').exists()).toBe(false)
    const target = new URL(link.attributes('href')!, 'https://church.test')
    expect(target.pathname).toBe('/events/new'); expect(target.searchParams.get('date')).toBe(day)
    expect(target.searchParams.get('return')).toContain('/calendar?date=2026-11-10&view=month&scope=church')
    grantPermissions(); await flushPromises()
    expect(page.find('[data-test="toolbar-create"]').exists()).toBe(false)
  })
  it('names the month button by its purpose, hides the picker field from assistive tech and keeps the «Ваши назначения» hint', async () => {
    const page = await month([])
    expect(page.get('[data-test="calendar-month-button"]').attributes('aria-label')).toBe('ноябрь 2026 г., перейти к дате')
    expect(page.get('[data-test="calendar-date"]').element.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(page.find('.calendar-zone').exists() ? page.get('.calendar-zone').text() : '').not.toContain('Ваши назначения')
    await page.get('[data-test="scope-mine"]').trigger('click'); await flushPromises()
    expect(page.get('.calendar-zone').text()).toContain('Ваши назначения')
  })
  it('adds the following events of the same week under the selected day', async () => {
    const page = await month([event({ id: 'wed', title: 'Среда', starts_at: '2026-11-11T07:00:00Z', ends_at: '2026-11-11T08:00:00Z' }), event({ id: 'next', title: 'Следующая неделя', starts_at: '2026-11-16T07:00:00Z', ends_at: '2026-11-16T08:00:00Z' })])
    const rest = page.get('[data-test="week-rest"]')
    expect(rest.text()).toContain('Дальше на неделе'); expect(rest.text()).toContain('Среда'); expect(rest.text()).not.toContain('Следующая неделя')
  })
})
describe('calendar on a phone', () => {
  // Сегодня в Владивостоке 9 ноября 2026 (на устройстве ещё 8-е в UTC).
  const row = (day: number, i = 1, over: Partial<EventItem> = {}) => event({ id: `d${day}-${i}`, title: `Событие ${day}-${i}`, starts_at: `2026-11-${String(day).padStart(2, '0')}T0${i}:00:00Z`, ends_at: `2026-11-${String(day).padStart(2, '0')}T0${i}:30:00Z`, ...over })
  const scrolled = vi.fn()
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: query.includes('max-width'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList)
    scrolled.mockReset(); Element.prototype.scrollIntoView = scrolled
  })
  afterEach(() => vi.restoreAllMocks())
  const phone = async (items: EventItem[], query: Record<string, string> = {}) => {
    Object.assign(routeQuery, { view: 'list', ...query }); get.mockResolvedValue(list(items))
    return mountSuspended(CalendarPage)
  }
  it('starts the list at the church today and hides the legend and the desktop-only controls', async () => {
    const page = await phone([row(2), row(9), row(12)])
    const headings = page.findAll('.event-list h2').map(h => h.text())
    expect(headings[0]).toContain('Сегодня'); expect(headings[1]).toContain('12 ноября')
    expect(page.text()).not.toContain('Событие 2-1'); expect(page.text()).toContain('Событие 9-1')
    expect(page.find('[data-test="calendar-legend"]').exists()).toBe(false)
    expect(page.find('[data-test="strip-days"]').exists()).toBe(true)
    expect(page.find('.calendar-toolbar').exists()).toBe(false)
  })
  it('puts the chips in one row: scope, a native ministry select and the month switch', async () => {
    grantPermissions({ ministries: { m1: [] } })
    get.mockImplementation(async (path: string) => path === '/ministries' ? { data: [{ id: 'm1', name: 'Хор' }] } : list([]))
    Object.assign(routeQuery, { view: 'list' })
    const page = await mountSuspended(CalendarPage)
    const chips = page.get('[data-test="phone-chips"]')
    expect(chips.findAll('button').map(button => button.text())).toEqual(['Все', 'Мои', 'Месяц'])
    expect(chips.get('select').text()).toContain('Хор')
    await chips.get('[data-test="phone-view-switch"]').trigger('click')
    expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ query: expect.objectContaining({ view: 'month' }) }))
  })
  it('shows a «+» named «Создать событие» only to those who can create, for the selected day with the return context', async () => {
    grantPermissions({ global: ['calendar.church.manage'] })
    const page = await phone([], { date: '2026-11-12' })
    const link = page.get('[data-test="toolbar-create"]')
    expect(link.attributes('aria-label')).toBe('Создать событие'); expect(link.text()).toBe('+')
    const target = new URL(link.attributes('href')!, 'https://church.test')
    expect(target.searchParams.get('date')).toBe('2026-11-12'); expect(target.searchParams.get('return')).toContain('/calendar?date=2026-11-12&view=list&scope=church')
    grantPermissions(); await flushPromises()
    expect(page.find('[data-test="toolbar-create"]').exists()).toBe(false)
  })
  it('reveals past days of the month above the list on demand', async () => {
    const page = await phone([row(2), row(9), row(12)])
    const button = page.get('[data-test="show-past"]')
    expect(button.text()).toBe('Показать прошедшие')
    await button.trigger('click'); await flushPromises()
    const headings = page.findAll('.event-list h2').map(h => h.text())
    expect(headings[0]).toContain('2 ноября'); expect(headings[1]).toContain('Сегодня')
    expect(page.find('[data-test="show-past"]').exists()).toBe(false)
  })
  it('offers the past days button only when the shown month has past days', async () => {
    const none = await phone([row(12)], { date: '2026-11-09' })
    expect(none.find('[data-test="show-past"]').exists()).toBe(false)
    const page = await phone([row(2), row(12)], { date: '2026-11-09' })
    expect(page.find('[data-test="show-past"]').exists()).toBe(true)
    const future = await phone([row(12)], { date: '2026-12-09' })
    expect(future.find('[data-test="show-past"]').exists()).toBe(false)
  })
  it('keeps a whole past month readable from its first day without the button', async () => {
    const page = await phone([row(2)], { date: '2026-10-15' })
    expect(page.find('[data-test="show-past"]').exists()).toBe(false)
  })
  it('scrolls to the heading of a day picked in the strip, reveals it if past, and keeps date, view and scope in the URL', async () => {
    const page = await phone([row(2), row(9), row(12)])
    await page.get('[data-test="strip-day-2026-11-12"]').trigger('click'); await flushPromises()
    expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ query: { date: '2026-11-12', view: 'list', scope: 'church' } }))
    expect(scrolled).toHaveBeenCalled()
    expect(page.get('[data-test="selected-day"]').text()).toContain('12 ноября')
    await page.get('[data-test="strip-day-2026-11-12"]').trigger('click'); await flushPromises()
    await page.get('[data-test="strip-previous"]').trigger('click'); await flushPromises()
    await page.get('[data-test="strip-day-2026-11-02"]').trigger('click'); await flushPromises()
    expect(page.get('[data-test="selected-day"]').text()).toContain('2 ноября')
    expect(page.text()).toContain('Событие 2-1')
  })
  it('renders an empty selected day explicitly', async () => {
    const page = await phone([row(12)], { date: '2026-11-20' })
    expect(page.get('[data-test="selected-day"]').text()).toContain('20 ноября'); expect(page.get('[data-test="selected-day"]').text()).toContain('Событий нет')
  })
  it('shows the general empty state instead of an empty day when the month has no events', async () => {
    const page = await phone([])
    expect(page.text()).toContain('Событий пока нет.'); expect(page.find('[data-test="selected-day"]').exists()).toBe(false)
  })
  it('opens a row through one stretched link and keeps the calendar context for the way back', async () => {
    useAuthStore().person = { id: 'me' } as never
    const mine = row(12, 1, { ministry: { id: 'm1', name: 'Хор', color: 'teal' } }); mine.slots[0]!.assignments = [{ id: 'a', person: { id: 'me', full_name: 'Я Я', short_name: 'Я Я', photo_thumb_url: null }, created_at: null }]
    const page = await phone([mine, row(12, 2, { status: 'cancelled' })], { date: '2026-11-12', scope: 'church' })
    const rows = page.findAll('.event-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.findAll('a')).toHaveLength(1); expect(rows[0]!.text()).toContain('Вы')
    expect(rows[1]!.text()).toContain('Отменено'); expect(rows[1]!.classes()).toContain('is-cancelled')
    expect(new URL(rows[0]!.get('a').attributes('href')!, 'https://church.test').searchParams.get('return')).toBe('/calendar?date=2026-11-12&view=list&scope=church')
  })
})
describe('event detail and display hooks', () => {
  it('keeps a confirmed event edit after GET fails and retries only the read', async () => {
    grantPermissions({ global: ['calendar.church.manage'] })
    const original = event({ can_manage: true })
    get.mockResolvedValue({ data: original })
    const page = await mountSuspended(EventPage)
    await page.get('[data-test="edit-event"]').trigger('click'); await flushPromises()
    await page.get('[data-test="title"]').setValue('Сохранённое название')
    patch.mockResolvedValue({ data: { ...original, title: 'Сохранённое название' } })
    get.mockRejectedValueOnce(new Error('offline'))
    await page.get('[data-test="save-event-top"]').trigger('submit'); await flushPromises()
    expect(page.get('h1').text()).toBe('Сохранённое название')
    expect(page.find('.event-editor').exists()).toBe(false)
    expect(page.text()).toContain('Изменение сохранено')
    expect(page.get('[data-test="edit-event"]').attributes('disabled')).toBeDefined()
    get.mockResolvedValueOnce({ data: { ...original, title: 'Сохранённое название' } })
    await page.get('[data-test="retry-assignments"]').trigger('click'); await flushPromises()
    expect(page.get('[data-test="edit-event"]').attributes('disabled')).toBeUndefined()
    expect(patch).toHaveBeenCalledTimes(1)
  })
  it('preserves editor input across a permitted rights refresh and masks the roster on revocation', async () => {
    grantPermissions({ global: ['calendar.church.manage', 'people.view'] })
    const original = event({ can_manage: true })
    original.slots[0]!.assignments = [{ id: 'a1', person: { id: 'other', full_name: 'Чужое имя', short_name: 'Чужое имя', photo_thumb_url: '/photo' }, created_at: null }]
    get.mockResolvedValue({ data: original })
    const page = await mountSuspended(EventPage)
    await page.get('[data-test="edit-event"]').trigger('click'); await flushPromises()
    await page.get('[data-test="title"]').setValue('Мой ввод')
    grantPermissions({ global: ['calendar.church.manage', 'people.view', 'ministries.view_all'] }); await flushPromises()
    expect(page.get('[data-test="title"]').element).toHaveProperty('value', 'Мой ввод')
    let finish!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    grantPermissions(); await flushPromises()
    expect(page.get('[data-test="save-event-top"]').element.closest('fieldset')!.disabled).toBe(true)
    finish({ data: { ...original, can_manage: false, slots: original.slots.map(s => ({ ...s, can_fill: false, assignments: [] })) } }); await flushPromises()
    expect(page.text()).not.toContain('Чужое имя')
    expect(page.get('[data-test="title"]').element).toHaveProperty('value', 'Мой ввод')
  })
  it('does not reopen a saved slot editor or repeat its PATCH after refresh failure', async () => {
    grantPermissions({ global: ['calendar.church.manage'] })
    const original = event({ can_manage: true })
    get.mockImplementation(async path => ({ data: path === '/calendar/slot-choices' ? [] : original }))
    const page = await mountSuspended(EventPage)
    await page.get('[data-test="edit-slot-s1"]').trigger('click'); await flushPromises()
    await page.get('[data-test="slot-0-count"]').setValue('4')
    patch.mockResolvedValue({})
    get.mockRejectedValueOnce(new Error('offline'))
    await page.get('[data-test="save-slot"]').trigger('click'); await flushPromises()
    expect(page.find('[data-test="save-slot"]').exists()).toBe(false)
    expect(page.text()).toContain('Изменение сохранено')
    expect(page.get('[data-test="edit-slot-s1"]').attributes('disabled')).toBeDefined()
    get.mockResolvedValueOnce({ data: { ...original, slots: original.slots.map(s => ({ ...s, required_count: 4 })) } })
    await page.get('[data-test="retry-assignments"]').trigger('click'); await flushPromises()
    expect(page.get('[data-test="slot-s1-count"]').text()).toBe('3 из 4')
    expect(patch).toHaveBeenCalledTimes(1)
  })
  it('confirms event cancellation in its own dialog and does not allow a repeated successful cancellation', async () => {
    post.mockResolvedValue({})
    const dialog = await mountSuspended(CancelEventDialog, { props: { eventId: 'e1' } })
    expect(dialog.get('dialog').attributes('aria-label')).toBe('Отменить событие?')
    await dialog.get('[data-test="reason"]').setValue(' Ремонт ')
    expect(post).not.toHaveBeenCalled()
    await dialog.get('[data-test="confirm-cancel"]').trigger('click'); await flushPromises()
    expect(post).toHaveBeenCalledWith('/events/e1/cancel', { reason: 'Ремонт' })
    await dialog.get('[data-test="confirm-cancel"]').trigger('click'); await flushPromises()
    expect(post).toHaveBeenCalledTimes(1)
  })
  it('ignores a cancellation response from a previous session', async () => {
    let finish!: () => void
    post.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const dialog = await mountSuspended(CancelEventDialog, { props: { eventId: 'e1' } })
    await dialog.get('[data-test="confirm-cancel"]').trigger('click')
    useAuthStore().sessionVersion++; await flushPromises(); finish(); await flushPromises()
    expect(dialog.emitted('saved')).toBeUndefined()
    expect(dialog.find('[data-test="confirm-cancel"]').exists()).toBe(false)
  })
  it('shows my assignment before event information and offers structural actions in the single roster', async () => {
    const item = event({ can_manage: true })
    item.slots[0]!.assignments = [{ id: 'mine', person: { id: useAuthStore().person!.id, full_name: null, short_name: null, photo_thumb_url: '/private' }, created_at: null }]
    get.mockResolvedValue({ data: item })
    const page = await mountSuspended(EventPage)
    expect(page.get('[data-test="my-participation"]').text()).toContain('Вы назначены')
    expect(page.get('[data-test="my-participation"]').text()).toContain('Вокалист')
    expect(page.findAll('[data-test="edit-slot-s1"]')).toHaveLength(1)
    expect(page.findAll('.slot')).toHaveLength(1)
    expect(page.text().split('Вокалист')).toHaveLength(3) // participation + single roster
    expect(page.find('img').exists()).toBe(false)
  })
  it('replaces the detail with an explicit editor and retains its own cancel confirmation', async () => {
    grantPermissions({ global: ['calendar.church.manage'] })
    get.mockResolvedValue({ data: event({ can_manage: true }) })
    const page = await mountSuspended(EventPage, { attachTo: document.body })
    await page.get('[data-test="edit-event"]').trigger('click'); await flushPromises()
    expect(page.get('h1').text()).toContain('Редактирование события')
    expect(page.find('.event-card').exists()).toBe(false)
    expect(page.find('.slot').exists()).toBe(false)
    expect(document.activeElement).toBe(page.get('[data-test="title"]').element)
    await page.get('[data-test="title"]').setValue('Новый заголовок')
    await page.get('[data-test="cancel-edit"]').trigger('click')
    expect(page.find('[data-test="discard-edit"]').exists()).toBe(true)
    expect(page.find('.event-editor').exists()).toBe(true)
    await page.get('[data-test="keep-editing"]').trigger('click')
    expect(page.get('[data-test="title"]').element).toHaveProperty('value', 'Новый заголовок')
    await page.get('[data-test="cancel-edit"]').trigger('click')
    await page.get('[data-test="discard-edit"]').trigger('click'); await flushPromises()
    expect(page.find('.event-editor').exists()).toBe(false)
    expect(page.find('[data-test="edit-event"]').exists()).toBe(true)
  })
  it.each([['/calendar?date=2026-12-31&view=month&scope=mine', '/calendar?date=2026-12-31&view=month&scope=mine'], ['https://evil.test', '/calendar'], ['', '/calendar']])('keeps a safe return context %s', async (context, expected) => {
    routeQuery.return = context
    get.mockResolvedValue({ data: event() })
    const page = await mountSuspended(EventPage)
    expect(page.findAll('a').find(link => link.text() === 'Календарь')?.attributes('href')).toBe(expected)
  })
  it('shows the next civil end date at midnight without adding a second calendar day', async () => {
    const card = await mountSuspended(EventCard, { props: { compact: true, day: '2026-11-08', event: event({ starts_at: '2026-11-08T07:00:00Z', ends_at: '2026-11-08T14:00:00Z' }) } })
    expect(card.text()).toContain('9 нояб.')
    expect(card.text()).toContain('00:00')
  })
  it('shows both church dates for an event crossing midnight', async () => {
    const card = await mountSuspended(EventCard, { props: { event: event({ starts_at: '2026-11-08T13:30:00Z', ends_at: '2026-11-08T15:30:00Z' }) } })
    expect(card.text()).toContain('8 нояб.'); expect(card.text()).toContain('9 нояб.')
  })
  it('shows description, cancellation reason, attachments and over capacity', async () => {
    get.mockResolvedValue({ data: event({ status: 'cancelled', cancel_reason: 'Ремонт', attachments: [{ id: 'file', url: '/file', kind: 'document', thumb_url: null } as never] }) })
    const page = await mountSuspended(EventPage)
    expect(page.get('[data-test="slot-s1-count"]').text()).toBe('3 из 2')
    expect(page.text()).toContain('Описание события'); expect(page.text()).toContain('Ремонт')
    expect(page.get('[data-test="cancelled-e1"]').text()).toContain('Отменено')
    expect(page.find('a[href="/file"]').exists()).toBe(true)
    expect(page.find('[data-test="edit-event"]').exists()).toBe(false)
    expect(page.find('[data-test="assign-s1"]').exists()).toBe(false)
  })
  it('emits allowed management and fill hooks without making mutations', async () => {
    const item = event({ can_manage: true })
    const card = await mountSuspended(EventCard, { props: { event: item, detail: true } })
    await card.get('[data-test="edit-event"]').trigger('click'); await card.get('[data-test="cancel-event"]').trigger('click')
    expect(card.emitted('edit')?.[0]).toEqual([item]); expect(card.emitted('cancel')?.[0]).toEqual([item])
    const slots = await mountSuspended(SlotList, { props: { slots: [{ ...item.slots[0]!, can_fill: true }] } })
    await slots.get('[data-test="assign-s1"]').trigger('click')
    expect(slots.emitted('assign')?.[0]?.[0]).toMatchObject({ id: 's1' })
  })
  it('renders hidden identity neutrally without image or person link', async () => {
    const item = event(); item.slots[0]!.assignments = [{ id: 'a1', person: { id: 'private', full_name: null, short_name: null, photo_thumb_url: null }, created_at: null }]
    get.mockResolvedValue({ data: item })
    const page = await mountSuspended(EventPage)
    expect(page.text()).toContain('Имя скрыто'); expect(page.find('img').exists()).toBe(false)
    expect(page.find('a[href*="private"]').exists()).toBe(false)
  })
  it('only links a ministry accessible in the existing permission snapshot', async () => {
    const item = event({ owner_type: 'ministry', ministry: { id: 'm1', name: 'Хор', color: 'violet' } })
    const card = await mountSuspended(EventCard, { props: { event: item } })
    expect(card.text()).toContain('Хор'); expect(card.find('a[href="/ministries/m1"]').exists()).toBe(false)
    useAuthStore().permissions = { administrator: false, global: [], ministries: { m1: [] } }
    await card.vm.$nextTick(); expect(card.find('a[href="/ministries/m1"]').exists()).toBe(true)
  })
})
