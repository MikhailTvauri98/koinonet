// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarPage from '~/pages/calendar.vue'
import EventPage from '~/pages/events/[id].vue'
import UpcomingEvents from '~/components/calendar/UpcomingEvents.vue'
import EventCard from '~/components/calendar/EventCard.vue'
import SlotList from '~/components/calendar/SlotList.vue'
import type { EventItem } from '~/composables/useEvents'
import { useSettingsStore } from '~/stores/settings'
import { useAuthStore } from '~/stores/auth'
import { grantPermissions } from '../support/permissions'

const get = vi.fn()
mockNuxtImport('useApi', () => () => ({ get }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'e1' }, query: {} }))
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
  get.mockReset(); grantPermissions()
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Asia/Vladivostok' } as never)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-08T20:30:00Z'))
})
afterEach(() => vi.useRealTimers())
describe('calendar page', () => {
  it('starts at church Monday, requests four weeks and switches scopes and weeks', async () => {
    get.mockResolvedValue(list([event()]))
    const page = await mountSuspended(CalendarPage)
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ from: '2026-11-09', to: '2026-12-06', scope: 'church' }))
    await page.get('[data-test="scope-mine"]').trigger('click'); await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/events', expect.objectContaining({ scope: 'mine' }))
    await page.get('[data-test="next-week"]').trigger('click'); await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/events', expect.objectContaining({ from: '2026-11-16', to: '2026-12-13', scope: 'mine' }))
  })
  it('keeps western date-only headers on their chosen day', async () => {
    useSettingsStore().timezone = 'America/Los_Angeles'; get.mockResolvedValue(list([event({ starts_at: '2026-11-09T02:00:00Z' })]))
    const page = await mountSuspended(CalendarPage)
    expect(page.text()).toContain('8 ноября')
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ from: '2026-11-02', to: '2026-11-29' }))
  })
  it('ignores stale scope responses', async () => {
    get.mockResolvedValueOnce(list([]))
    const page = await mountSuspended(CalendarPage)
    let old!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise(resolve => { old = resolve })).mockResolvedValueOnce(list([event({ title: 'Актуальное' })]))
    await page.get('[data-test="next-week"]').trigger('click')
    await page.get('[data-test="scope-mine"]').trigger('click'); await flushPromises()
    old(list([event({ title: 'Устаревшее' })])); await flushPromises()
    expect(page.text()).toContain('Актуальное'); expect(page.text()).not.toContain('Устаревшее')
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
describe('event detail and display hooks', () => {
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
    const item = event(); item.slots[0]!.assignments = [{ id: 'a1', person: { id: 'private', full_name: null, photo_thumb_url: null }, created_at: null }]
    get.mockResolvedValue({ data: item })
    const page = await mountSuspended(EventPage)
    expect(page.text()).toContain('Имя скрыто'); expect(page.find('img').exists()).toBe(false)
    expect(page.find('a[href*="private"]').exists()).toBe(false)
  })
  it('only links a ministry accessible in the existing permission snapshot', async () => {
    const item = event({ owner_type: 'ministry', ministry: { id: 'm1', name: 'Хор' } })
    const card = await mountSuspended(EventCard, { props: { event: item } })
    expect(card.text()).toContain('Хор'); expect(card.find('a[href="/ministries/m1"]').exists()).toBe(false)
    useAuthStore().permissions = { administrator: false, global: [], ministries: { m1: [] } }
    await card.vm.$nextTick(); expect(card.find('a[href="/ministries/m1"]').exists()).toBe(true)
  })
})
describe('home upcoming events', () => {
  it('waits for initial settings and makes one upcoming request using the confirmed timezone', async () => {
    useSettingsStore().reset()
    get.mockImplementation(async (path: string) => path === '/settings'
      ? { data: { church_name: 'Церковь', timezone: 'Asia/Vladivostok' } }
      : list([]))
    await mountSuspended(UpcomingEvents)
    await flushPromises()
    const eventRequests = get.mock.calls.filter(call => call[0] === '/events')
    expect(eventRequests).toHaveLength(1)
    expect(eventRequests[0]![1]).toMatchObject({ from: '2026-11-09', to: '2026-11-22' })
  })
  it('loads mine for fourteen church dates, filters already started events and caps at five', async () => {
    get.mockResolvedValue(list([event({ id: 'past' }), ...Array.from({ length: 7 }, (_, n) => event({ id: `future${n}`, starts_at: `2026-11-${String(9 + n).padStart(2, '0')}T07:00:00Z`, status: n === 0 ? 'cancelled' : 'scheduled' }))]))
    const page = await mountSuspended(UpcomingEvents)
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ scope: 'mine', from: '2026-11-09', to: '2026-11-22' }))
    expect(page.findAll('article')).toHaveLength(5); expect(page.find('[data-test="cancelled-future0"]').exists()).toBe(true)
    expect(page.find('a[href="/events/past"]').exists()).toBe(false)
  })
  it('keeps a local error and retry when upcoming events fail', async () => {
    get.mockRejectedValueOnce(new Error('offline'))
    const page = await mountSuspended(UpcomingEvents)
    expect(page.find('[role="alert"]').exists()).toBe(true)
    get.mockResolvedValue(list([])); await page.get('button').trigger('click'); await flushPromises()
    expect(page.text()).toContain('Ближайших событий пока нет')
  })
})
