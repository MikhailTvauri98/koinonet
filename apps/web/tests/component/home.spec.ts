// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '~/pages/index.vue'
import type { EventItem, EventSlot } from '~/composables/useEvents'
import { useSettingsStore } from '~/stores/settings'
import { useChatsStore } from '~/stores/chats'
import { grantPermissions } from '../support/permissions'

const get = vi.fn()
mockNuxtImport('useApi', () => () => ({ get }))
enableAutoUnmount(afterEach)

const me = 'p-signed-in'
const slot = (label: string, personId?: string): EventSlot => ({
  id: 's-' + label, label, resource_type: 'person', role: null, required_count: 1, filled_count: personId ? 1 : 0, sort_order: 0, can_fill: false,
  assignments: personId ? [{ id: 'as-' + label, person: { id: personId, full_name: 'Имя Фамилия', short_name: 'Имя Фамилия', photo_thumb_url: null }, created_at: '2026-11-01T08:00:00Z' }] : [],
})
const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1', chat_id: null, owner_type: 'church', ministry: null, template_id: null, occurrence_date: null,
  title: 'Воскресное служение', description: '', location: 'Главный зал',
  starts_at: '2026-11-15T01:00:00Z', ends_at: '2026-11-15T03:00:00Z', visibility: 'church', status: 'scheduled',
  cancelled_at: null, cancel_reason: null, can_manage: false, attachments: [], slots: [], ...over,
})
const list = (items: EventItem[]) => ({ data: items, meta: { current_page: 1, last_page: 1, total: items.length } })
function api(options: { mine?: EventItem[], week?: EventItem[] }) {
  get.mockImplementation(async (path: string, query?: Record<string, unknown>) => {
    if (path === '/events') return list(query?.scope === 'mine' ? options.mine ?? [] : options.week ?? [])
    if (path === '/announcements') return { data: [], meta: { current_page: 1, last_page: 1, total: 0 } }
    if (path === '/chats') return { data: [], meta: { unread_total: 0 } }
    return { data: [] }
  })
}
const headings = (page: Awaited<ReturnType<typeof mountSuspended>>) => page.findAll('.home-section__header h2').map((node: { text: () => string }) => node.text())

beforeEach(() => {
  get.mockReset(); grantPermissions(); useChatsStore().unsubscribeUser()
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Asia/Vladivostok' } as never)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-08T20:30:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('home «Моя неделя»', () => {
  it('shows week events and no serving block to a person without assignments', async () => {
    api({ week: [event(), event({ id: 'e2', title: 'Репетиция', location: null, starts_at: '2026-11-11T09:00:00Z', ends_at: '2026-11-11T10:00:00Z', ministry: { id: 'm1', name: 'Хор', color: 'teal' } })] })
    const page = await mountSuspended(HomePage)
    await flushPromises()
    expect(headings(page)).toEqual(['На этой неделе', 'Объявления', 'Сообщения'])
    expect(page.text()).not.toContain('Вы служите')
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ scope: 'church', from: '2026-11-09', to: '2026-11-15' }))
    const rows = page.findAll('[data-test="week-event"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Репетиция')
    expect(rows[1]!.text()).toContain('Главный зал')
    expect(rows[0]!.text()).toContain('Хор')
    expect(rows[1]!.find('a').attributes('href')).toMatch(/^\/events\/e1\?return=/)
    expect(page.find('[data-test="week-mine-e1"]').exists()).toBe(false)
  })

  it('puts the serving block first with open and event chat actions and tags own week events', async () => {
    const own = event({ id: 'own', title: 'Служение с вашим участием', chat_id: 'c9', slots: [slot('Вокал', me), slot('Звук')] })
    api({ mine: [own], week: [own, event()] })
    const page = await mountSuspended(HomePage)
    await flushPromises()
    expect(headings(page)).toEqual(['Вы служите', 'На этой неделе', 'Объявления', 'Сообщения'])
    const serving = page.get('section[aria-label="Вы служите"]')
    expect(serving.text()).toContain('Служение с вашим участием')
    expect(serving.text()).toContain('Вокал')
    expect(serving.text()).not.toContain('Звук')
    expect(serving.get('a.ui-button--primary').text()).toBe('Открыть')
    expect(serving.get('a.ui-button--primary').attributes('href')).toMatch(/^\/events\/own/)
    expect(serving.findAll('a').find(link => link.text() === 'Чат события')!.attributes('href')).toBe('/chats/c9')
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ scope: 'mine', from: '2026-11-09', to: '2026-11-22' }))
    expect(page.get('[data-test="week-mine-own"]').text()).toBe('Вы')
    expect(page.find('[data-test="week-mine-e1"]').exists()).toBe(false)
  })

  it('omits the event chat action when the event has no chat and skips cancelled assignments', async () => {
    const cancelled = event({ id: 'x', title: 'Отменённое', status: 'cancelled', slots: [slot('Вокал', me)], starts_at: '2026-11-09T01:00:00Z' })
    const own = event({ id: 'own', slots: [slot('Вокал', me)] })
    api({ mine: [cancelled, own], week: [] })
    const page = await mountSuspended(HomePage)
    await flushPromises()
    const serving = page.get('section[aria-label="Вы служите"]')
    expect(serving.text()).toContain('Воскресное служение')
    expect(serving.text()).not.toContain('Отменённое')
    expect(serving.text()).not.toContain('Чат события')
  })

  it('marks cancelled week events with text and strikes them', async () => {
    api({ week: [event({ status: 'cancelled', cancel_reason: 'Болезнь' })] })
    const page = await mountSuspended(HomePage)
    await flushPromises()
    const row = page.get('[data-test="week-event"]')
    expect(row.get('[data-test="week-cancelled-e1"]').text()).toContain('Отменено')
    expect(row.classes()).toContain('week-row--cancelled')
  })

  it('says so on an empty week and drops the directory, ministries and profile links', async () => {
    api({})
    grantPermissions({ administrator: true })
    const page = await mountSuspended(HomePage)
    await flushPromises()
    expect(page.text()).toContain('На этой неделе событий нет')
    expect(page.find('[data-test="week-event"]').exists()).toBe(false)
    for (const href of ['/people', '/ministries', '/settings/profile']) expect(page.find(`a[href="${href}"]`).exists()).toBe(false)
    expect(page.text()).not.toContain('Справочник')
  })

  it('keeps loaded week events without red text when the connection drops on refresh', async () => {
    api({ week: [event()] })
    const page = await mountSuspended(HomePage)
    await flushPromises()
    expect(page.find('[data-test="week-event"]').exists()).toBe(true)
    expect(page.find('[role="alert"]').exists()).toBe(false)
    get.mockImplementation(async (path: string) => {
      if (path === '/events') throw new Error('offline')
      return { data: [], meta: { current_page: 1, last_page: 1, total: 0 } }
    })
    useSettingsStore().apply({ church_name: 'Церковь', timezone: 'America/New_York' } as never)
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.text()).not.toContain('На этой неделе событий нет')
  })
})
