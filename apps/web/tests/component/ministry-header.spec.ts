// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MinistryAnnouncements from '~/pages/ministries/[id]/announcements.vue'
import MinistryChat from '~/pages/ministries/[id]/chat.vue'
import MinistryEvents from '~/pages/ministries/[id]/events.vue'
import MinistryCard from '~/pages/ministries/[id]/index.vue'
import MinistryMembers from '~/pages/ministries/[id]/members.vue'
import MinistryRoles from '~/pages/ministries/[id]/roles.vue'
import MinistryHeader from '~/components/ministries/MinistryHeader.vue'
import MinistryColorField from '~/components/ministries/MinistryColorField.vue'
import { useSettingsStore } from '~/stores/settings'
import { membersCountLabel, type Ministry } from '~/utils/ministries'
import { grantPermissions } from '../support/permissions'

const get = vi.fn(), post = vi.fn(), patch = vi.fn(), put = vi.fn()
mockNuxtImport('useApi', () => () => ({ get, post, patch, put }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'm1' }, query: {}, path: '/ministries/m1', fullPath: '/ministries/m1' }))
enableAutoUnmount(afterEach)

const ministry: Ministry = {
  id: 'm1', name: 'Прославление', description: 'Хвала и музыка', cover_url: null, color: 'teal', members_count: 5, default_role_id: 'r1', chat_id: 'c1', archived_at: null,
}
beforeEach(() => {
  [get, post, patch, put].forEach(fn => fn.mockReset())
  grantPermissions({ ministries: { m1: ['members.manage', 'roles.manage', 'ministry.edit', 'events.manage'] } })
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Asia/Vladivostok' } as never)
  get.mockImplementation((path: string) => Promise.resolve(
    path === '/ministries/m1' ? { data: ministry }
      : path === '/events' || path === '/announcements' ? { data: [], meta: { current_page: 1, last_page: 1, total: 0 } }
        : { data: [] },
  ))
})

// Сценарий 12: заголовок служения не меняется при переходе по вкладкам.
const routes = [
  ['overview', MinistryCard, {}],
  ['members', MinistryMembers, {}],
  ['roles', MinistryRoles, {}],
  ['events', MinistryEvents, { CalendarBrowser: true }],
  ['announcements', MinistryAnnouncements, { AnnouncementList: true }],
  ['chat', MinistryChat, { ChatWorkspace: true }],
] as const

describe('ministry header on every ministry route', () => {
  it.each(routes)('%s: the only h1 is the ministry name, with the members count and tabs under it', async (name, page, stubs) => {
    const view = await mountSuspended(page, { global: { stubs } })
    await flushPromises()

    expect(view.findAll('h1').map(heading => heading.text())).toEqual(['Прославление'])
    expect(view.get('[data-test="members-count"]').text()).toBe('5 участников')
    expect(view.get('a[href="/ministries/m1/members"] [data-test="tab-members-count"]').text()).toBe('5')
    expect(view.find('nav[aria-label="Разделы служения"]').exists()).toBe(true)
    // На вкладке чата шапка сжата до одной строки: путь назад там даёт стрелка чата.
    if (name === 'chat') expect(view.find('.ministry-header__back').exists()).toBe(false)
    else expect(view.get('.ministry-header__back a').text()).toBe('‹ Служения')
    // Плитка цвета при отсутствии обложки.
    expect(view.get('[data-test="ministry-tile"]').text()).toBe('П')
    expect(view.get('[data-test="ministry-tile"]').attributes('style')).toContain('--ui-ministry-teal')
  })

  it('shows the cover instead of the tile when there is one', async () => {
    get.mockImplementation(() => Promise.resolve({ data: { ...ministry, cover_url: 'https://church.test/cover.webp' } }))

    const view = await mountSuspended(MinistryCard)

    expect(view.get('[data-test="ministry-cover"]').attributes('src')).toBe('https://church.test/cover.webp')
    expect(view.find('[data-test="ministry-tile"]').exists()).toBe(false)
  })

  it('keeps the page heading while a tab is still loading its own data', async () => {
    const view = await mountSuspended(MinistryMembers)
    await flushPromises()

    expect(view.get('h1').text()).toBe('Прославление')
    expect(view.text()).not.toContain('Состав и роли в служении')
  })

  it('shows the connection bar on the chat tab when the chat is not there yet', async () => {
    get.mockImplementation(() => Promise.resolve({ data: { ...ministry, chat_id: null } }))

    const view = await mountSuspended(MinistryChat, { global: { stubs: { ConnectionStatus: { template: '<div data-test="connection-status" />' } } } })

    expect(view.find('[data-test="connection-status"]').exists()).toBe(true)
    expect(view.text()).toContain('Чат служения ещё не создан')
  })

  it('shows the connection bar on the chat tab when the ministry fails to load', async () => {
    get.mockImplementation(() => Promise.reject(new Error('offline')))

    const view = await mountSuspended(MinistryChat, { global: { stubs: { ConnectionStatus: { template: '<div data-test="connection-status" />' } } } })

    expect(view.find('[data-test="connection-status"]').exists()).toBe(true)
    expect(view.find('[role="alert"]').exists()).toBe(true)
  })
})

describe('ministry header without a loaded ministry', () => {
  it('keeps a page heading and the tabs while the ministry is loading', async () => {
    const view = await mountSuspended(MinistryHeader, { props: { ministry: null, ministryId: 'm1' } })

    expect(view.findAll('h1').map(heading => heading.text())).toEqual(['Служение'])
    expect(view.find('nav[aria-label="Разделы служения"]').exists()).toBe(true)
  })

  it('shows the load error of a tab with a retry that reloads the ministry', async () => {
    get.mockRejectedValueOnce(new Error('offline'))
    const view = await mountSuspended(MinistryMembers)
    await flushPromises()
    expect(view.get('h1').text()).toBe('Служение')
    expect(view.text()).toContain('Не удалось загрузить служение')

    await view.get('[data-test="retry-ministry"]').trigger('click')
    await flushPromises()

    expect(view.get('h1').text()).toBe('Прославление')
    expect(view.find('[data-test="retry-ministry"]').exists()).toBe(false)
  })
})

describe('members count wording', () => {
  it.each([[0, '0 участников'], [1, '1 участник'], [2, '2 участника'], [4, '4 участника'], [5, '5 участников'], [11, '11 участников'], [12, '12 участников'], [14, '14 участников'], [21, '21 участник'], [22, '22 участника'], [101, '101 участник'], [111, '111 участников']])('%i -> %s', (count, label) => {
    expect(membersCountLabel(count)).toBe(label)
  })
})

describe('ministry header menu', () => {
  it('returns focus to the trigger when the menu is closed', async () => {
    const view = await mountSuspended(MinistryHeader, { props: { ministry, ministryId: 'm1' }, attachTo: document.body })
    const trigger = view.get('[data-test="ministry-menu"]')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await view.get('dialog button.ui-button:not([data-test])').trigger('click')
    await flushPromises()

    expect(view.find('dialog').exists()).toBe(false)
    expect(trigger.attributes('aria-expanded')).toBe('false')
    view.unmount()
  })
})

describe('ministry colour field', () => {
  it('is a radiogroup of six labelled native radios with no preselection and a described error', async () => {
    const field = await mountSuspended(MinistryColorField, { props: { modelValue: null, error: 'Выберите цвет' } })
    const radios = field.findAll('input[type="radio"]')

    expect(field.get('fieldset').attributes('role')).toBe('radiogroup')
    expect(radios).toHaveLength(6)
    expect(new Set(radios.map(radio => radio.attributes('name'))).size).toBe(1)
    expect(radios.some(radio => (radio.element as HTMLInputElement).checked)).toBe(false)
    expect(field.findAll('label').map(label => label.text())).toEqual(['Фиолетовый', 'Бирюзовый', 'Розовый', 'Янтарный', 'Голубой', 'Зелёный'])
    expect(field.get('fieldset').attributes('aria-describedby')).toBe(field.get('[data-test="ministry-color-error"]').attributes('id'))
    await radios[2]!.setValue(true)
    expect(field.emitted('update:modelValue')).toEqual([['rose']])
  })

  it('marks the current value and has no error markup without an error', async () => {
    const field = await mountSuspended(MinistryColorField, { props: { modelValue: 'sky' } })

    expect((field.get('[data-test="color-sky"]').element as HTMLInputElement).checked).toBe(true)
    expect(field.find('[data-test="ministry-color-error"]').exists()).toBe(false)
    expect(field.get('fieldset').attributes('aria-describedby')).toBeUndefined()
  })
})
