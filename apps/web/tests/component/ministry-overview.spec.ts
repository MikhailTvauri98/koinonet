// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MinistryOverview from '~/pages/ministries/[id]/index.vue'
import MembersTab from '~/pages/ministries/[id]/members.vue'
import MemberRow from '~/components/ministries/MemberRow.vue'
import type { EventItem, EventSlot } from '~/composables/useEvents'
import type { Member, Ministry } from '~/utils/ministries'
import { useAuthStore } from '~/stores/auth'
import { useSettingsStore } from '~/stores/settings'
import { grantPermissions } from '../support/permissions'

const get = vi.fn()
const route = reactive({ params: { id: 'm1' } })
mockNuxtImport('useApi', () => () => ({ get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
mockNuxtImport('useRoute', () => () => route)
enableAutoUnmount(afterEach)

const ministry: Ministry = { id: 'm1', name: 'Прославление', description: null, cover_url: null, color: 'violet', members_count: 4, default_role_id: 'r-member', chat_id: 'c1', archived_at: null }
const roleMember = { id: 'r-member', name: 'Участник' }
const roleVocal = { id: 'r-vocal', name: 'Вокал' }
const roleGuitar = { id: 'r-guitar', name: 'Гитара' }
const member = (index: number, roles = [roleMember], name: string | null = `Участник ${index}`): Member => ({
  id: `mem${index}`, ministry_id: 'm1', person_id: `p${index}`, full_name: name, short_name: name, joined_at: '2026-09-01T10:00:00Z', photo_url: null, roles,
})
const slot = (id: string, required: number, filled: number, canFill = false): EventSlot => ({
  id, label: id, resource_type: 'person', role: null, required_count: required, filled_count: filled, sort_order: 0, can_fill: canFill, assignments: [],
})
const event = (id: string, over: Partial<EventItem> = {}): EventItem => ({
  id, chat_id: null, owner_type: 'ministry', ministry: { id: 'm1', name: 'Прославление', color: 'violet' }, template_id: null, occurrence_date: null,
  title: `Событие ${id}`, description: '', location: null, starts_at: '2026-11-12T01:00:00Z', ends_at: '2026-11-12T03:00:00Z',
  visibility: 'church', status: 'scheduled', cancelled_at: null, cancel_reason: null, can_manage: false, attachments: [], slots: [], ...over,
})
const announcement = (id: string, publishedAt: string, body = 'Текст объявления') => ({
  id, scope: 'ministry', ministry: { id: 'm1', name: 'Прославление', color: 'violet' }, author: null, title: `Объявление ${id}`, body, pinned: false,
  hide_after: null, notify_on_publish: false, published_at: publishedAt, archived: false, attachments: [],
})
const list = (items: unknown[]) => ({ data: items, meta: { current_page: 1, last_page: 1, total: items.length } })

interface Options { events?: EventItem[] | Error, members?: Member[] | Error, announcements?: unknown[] | Error, ministry?: Ministry }
function api(options: Options = {}) {
  get.mockImplementation(async (path: string) => {
    const respond = <T>(value: T | Error, wrap: (items: T) => unknown) => { if (value instanceof Error) throw value; return wrap(value) }
    if (path === '/events') return respond(options.events ?? [], items => list(items as unknown[]))
    if (path === '/announcements') return respond(options.announcements ?? [], items => list(items as unknown[]))
    if (path === '/ministries/m1/members') return respond(options.members ?? [], items => ({ data: items }))
    if (path === '/ministries/m1/roles') return { data: [] }
    if (/^\/ministries\/[^/]+$/.test(path)) return { data: options.ministry ?? ministry }
    return { data: [] }
  })
}
const mount = async () => { const page = await mountSuspended(MinistryOverview); await flushPromises(); return page }

beforeEach(() => {
  get.mockReset(); grantPermissions(); route.params.id = 'm1'
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Asia/Vladivostok' } as never)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-08T20:30:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('ministry overview: upcoming events', () => {
  it('asks for this ministry from today in church time and shows at most three events that have not ended', async () => {
    api({ events: [
      event('past', { starts_at: '2026-11-08T10:00:00Z', ends_at: '2026-11-08T12:00:00Z' }),
      event('e1'), event('e2', { starts_at: '2026-11-13T01:00:00Z', ends_at: '2026-11-13T03:00:00Z' }),
      event('e3', { starts_at: '2026-11-14T01:00:00Z', ends_at: '2026-11-14T03:00:00Z' }), event('e4', { starts_at: '2026-11-15T01:00:00Z', ends_at: '2026-11-15T03:00:00Z' }),
    ] })
    const page = await mount()
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ scope: 'ministry:m1', from: '2026-11-09' }))
    const rows = page.findAll('[data-test="overview-event"]')
    expect(rows.map(row => row.find('a').text())).toEqual(['Событие e1', 'Событие e2', 'Событие e3'])
    expect(rows[0]!.find('a').attributes('href')).toMatch(/^\/events\/e1\?return=/)
    expect(page.get('[data-test="all-events"]').attributes('href')).toBe('/ministries/m1/events')
  })

  it('says there are no upcoming events in one line', async () => {
    api({ events: [] })
    const page = await mount()
    expect(page.get('[data-test="overview-events-empty"]').text()).toBe('Ближайших событий нет')
  })

  it('shows the number of free places only to someone who can fill a slot or manage the event', async () => {
    api({ events: [
      event('plain', { slots: [slot('a', 2, 0), slot('b', 1, 0)] }),
      event('fill', { slots: [slot('a', 2, 1, true), slot('b', 2, 0)] }),
      event('manage', { can_manage: true, slots: [slot('a', 1, 0)] }),
    ] })
    const page = await mount()
    expect(page.find('[data-test="overview-places-plain"]').exists()).toBe(false)
    expect(page.get('[data-test="overview-places-fill"]').text()).toBe('3 места')
    expect(page.get('[data-test="overview-places-manage"]').text()).toBe('1 место')
  })

  it('marks a cancelled event as text and does not offer places on it', async () => {
    api({ events: [event('x', { status: 'cancelled', can_manage: true, slots: [slot('a', 1, 0, true)] })] })
    const page = await mount()
    expect(page.get('[data-test="overview-cancelled-x"]').text()).toBe('Отменено')
    expect(page.find('[data-test="overview-places-x"]').exists()).toBe(false)
  })

  it('ignores a late answer for the previous ministry', async () => {
    let release!: (value: unknown) => void
    get.mockImplementation((path: string, query?: Record<string, unknown>) => {
      if (path === '/events') return query?.scope === 'ministry:m1' ? new Promise(done => { release = done }) : Promise.resolve(list([event('new', { title: 'Новое служение событие' })]))
      if (path === '/announcements') return Promise.resolve(list([]))
      if (/^\/ministries\/[^/]+\/members$/.test(path)) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { ...ministry, id: path.split('/').pop()! } })
    })
    const page = await mountSuspended(MinistryOverview)
    route.params.id = 'm2'
    await flushPromises()
    release(list([event('old', { title: 'Старое событие' })]))
    await flushPromises()
    expect(page.text()).toContain('Новое служение событие')
    expect(page.text()).not.toContain('Старое событие')
  })

  it('drops events of the previous session when the account changes', async () => {
    api({ events: [event('e1')] })
    const page = await mount()
    expect(page.findAll('[data-test="overview-event"]')).toHaveLength(1)
    api({ events: [] })
    useAuthStore().sessionVersion++
    await flushPromises()
    expect(page.findAll('[data-test="overview-event"]')).toHaveLength(0)
  })
})

describe('ministry overview: composition', () => {
  it('counts roles without the default one, by count then name, and never reads a role name in a condition', async () => {
    api({ members: [
      member(1, [roleMember, roleVocal]), member(2, [roleMember, roleGuitar, roleVocal]), member(3, [roleMember, roleVocal]),
      member(4, [roleMember, roleGuitar]), member(5, [roleMember, { id: 'r-bass', name: 'Бас' }]),
    ] })
    const page = await mount()
    expect(page.get('[data-test="composition-roles"]').text()).toBe('Вокал 3 · Гитара 2 · Бас 1')
  })

  it('takes the default role from default_role_id, not from its name', async () => {
    api({ ministry: { ...ministry, default_role_id: 'r-vocal' }, members: [member(1, [roleVocal, roleGuitar]), member(2, [roleMember])] })
    const page = await mount()
    expect(page.get('[data-test="composition-roles"]').text()).toBe('Гитара 1 · Участник 1')
  })

  it('shows twelve avatars with names for a screen reader and a link to all members', async () => {
    api({ members: Array.from({ length: 15 }, (_, index) => member(index + 1)) })
    const page = await mount()
    const items = page.findAll('[data-test="composition-member"]')
    expect(items).toHaveLength(12)
    expect(items[0]!.text()).toContain('Участник 1')
    expect(items[0]!.find('[aria-hidden="true"].ui-avatar').exists()).toBe(true)
    expect(page.get('[data-test="all-members"]').attributes('href')).toBe('/ministries/m1/members')
  })

  it('shows a hidden name as a nameless participant', async () => {
    api({ members: [member(1, [roleMember], null)] })
    const page = await mount()
    expect(page.get('[data-test="composition-member"]').text()).toBe('?Участник')
  })
})

describe('ministry overview: announcement, chat and independence', () => {
  it('shows the newest announcement with plain text and a link to all', async () => {
    api({ announcements: [announcement('a1', '2026-11-01T10:00:00Z'), announcement('a2', '2026-11-05T10:00:00Z', '**Жирный** текст [ссылка](https://x.test)')] })
    const page = await mount()
    expect(get).toHaveBeenCalledWith('/announcements', expect.objectContaining({ scope: 'ministry', ministry: 'm1' }))
    const block = page.get('[data-test="overview-announcement"]')
    expect(block.text()).toContain('Объявление a2')
    expect(block.get('[data-test="announcement-preview"]').text()).toBe('Жирный текст ссылка')
    expect(block.text()).not.toContain('Объявление a1')
    expect(block.get('[data-test="all-announcements"]').attributes('href')).toBe('/ministries/m1/announcements')
  })

  it('shows no announcement block when there is none', async () => {
    api({ announcements: [] })
    const page = await mount()
    expect(page.find('[data-test="overview-announcement"]').exists()).toBe(false)
  })

  it('links to the chat tab only when the ministry has a chat', async () => {
    api()
    const page = await mount()
    expect(page.get('[data-test="overview-chat"]').attributes('href')).toBe('/ministries/m1/chat')
    api({ ministry: { ...ministry, chat_id: null } })
    route.params.id = 'm3'
    await flushPromises()
    expect(page.find('[data-test="overview-chat"]').exists()).toBe(false)
  })

  it('keeps the other blocks when one fails, and retries only that block', async () => {
    api({ events: new Error('boom'), members: [member(1)], announcements: [announcement('a1', '2026-11-05T10:00:00Z')] })
    const page = await mount()
    expect(page.get('[data-test="overview-events"]').find('[role="alert"]').exists()).toBe(true)
    expect(page.findAll('[data-test="composition-member"]')).toHaveLength(1)
    expect(page.get('[data-test="overview-announcement"]').text()).toContain('Объявление a1')
    api({ events: [event('e1')], members: [member(1)], announcements: [announcement('a1', '2026-11-05T10:00:00Z')] })
    await page.get('[data-test="retry-events"]').trigger('click')
    await flushPromises()
    expect(page.findAll('[data-test="overview-event"]')).toHaveLength(1)
  })

  it('has no admin blocks on screen: edit, cover and archive live only in the menu', async () => {
    grantPermissions({ global: ['ministries.create'], ministries: { m1: ['ministry.edit'] } })
    api()
    const page = await mount()
    for (const key of ['edit-ministry', 'edit-cover', 'edit-color', 'archive']) expect(page.find(`[data-test="${key}"]`).exists()).toBe(false)
    await page.get('[data-test="ministry-menu"]').trigger('click')
    await flushPromises()
    expect(page.get('dialog').text()).toContain('Изменить название и описание')
    expect(page.get('dialog').text()).toContain('Обложка')
    expect(page.get('dialog').text()).toContain('Архивировать')
    expect(page.text()).not.toMatch(/Лидер/)
  })
})

describe('member row roles', () => {
  const mountRow = (value: Member, defaultRoleId: string | null) => mountSuspended(MemberRow, { props: { member: value, defaultRoleId } })

  it('hides the default role when the member has others', async () => {
    const row = await mountRow(member(1, [roleMember, roleVocal]), 'r-member')
    expect(row.text()).toContain('Вокал')
    expect(row.get('.member-row__roles').text()).toBe('Вокал')
  })

  it('shows the default role when it is the only one', async () => {
    const row = await mountRow(member(1, [roleMember]), 'r-member')
    expect(row.get('.member-row__roles').text()).toBe('Участник')
  })

  it('shows every role when the ministry has no default role', async () => {
    const row = await mountRow(member(1, [roleMember, roleVocal]), null)
    expect(row.get('.member-row__roles').text()).toBe('Участник · Вокал')
  })

  it('applies the rule on the members tab from the ministry default_role_id', async () => {
    api({ members: [member(1, [roleMember, roleVocal])] })
    const page = await mountSuspended(MembersTab)
    await flushPromises()
    expect(page.get('.member-row__roles').text()).toBe('Вокал')
  })
})
