// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatsIndex from '~/pages/chats/index.vue'
import ChatList from '~/components/chat/ChatList.vue'
import UnreadChats from '~/components/chat/UnreadChats.vue'
import AppNav from '~/components/AppNav.vue'
import { useChatsStore, type ChatListItem } from '~/stores/chats'
import { grantPermissions } from '../support/permissions'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get }))
const entry: ChatListItem = {
  id: 'a', type: 'ministry', title: 'Прославление', avatar_url: null, ministry_id: 'm', event_id: null,
  archived: true, unread_count: 3, muted_until: '9999-12-31T00:00:00Z', is_owner: false,
  last_message: { id: 'message', body_preview: 'Репетиция в 18:00', deleted: false, created_at: '2026-12-01T10:00:00Z' }, last_message_at: '2026-12-01T10:00:00Z',
}
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  grantPermissions()
  useChatsStore().unsubscribeUser()
  get.mockResolvedValue({ data: [entry], meta: { unread_total: 3 } })
})
describe('chat list', () => {
  it('renders available preview, unread, mute, archive, church time and chat link', async () => {
    const page = await mountSuspended(ChatsIndex)
    expect(page.text()).toContain('Репетиция в 18:00')
    expect(page.find('[data-test="unread-a"]').text()).toBe('3')
    expect(page.find('[data-test="muted-a"]').text()).toContain('Без звука')
    expect(page.text()).toContain('Архив')
    expect(page.find('time').attributes('datetime')).toBe(entry.last_message_at)
    expect(page.find('a[href="/chats/a"]').exists()).toBe(true)
    expect(page.find('[data-test="new-group"]').exists()).toBe(false)
    const nav = await mountSuspended(AppNav)
    expect(nav.find('[data-test="chat-badge"]').text()).toBe('3')
    useChatsStore().setUnreadTotal(5)
    await flushPromises()
    expect(nav.find('[data-test="chat-badge"]').text()).toBe('5')
  })
  it('renders empty and deleted message fallbacks and ignores expired mute', async () => {
    const list = await mountSuspended(ChatList, { props: { chats: [{ ...entry, muted_until: '2000-01-01T00:00:00Z', last_message: null, last_message_at: null, unread_count: 0 }] } })
    expect(list.text()).toContain('Сообщений пока нет')
    expect(list.find('[data-test="muted-a"]').exists()).toBe(false)
    await list.setProps({ chats: [{ ...entry, last_message: { ...entry.last_message!, deleted: true, body_preview: '' } }] })
    expect(list.text()).toContain('Сообщение удалено')
    await list.setProps({ chats: [] })
    expect(list.text()).toContain('Чатов пока нет')
  })
  it('shows load error and retries', async () => {
    get.mockRejectedValueOnce(new Error('offline'))
    const page = await mountSuspended(ChatsIndex)
    expect(page.find('[role="alert"]').text()).toContain('Не удалось загрузить чаты')
    await page.find('button').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Прославление')
    expect(page.find('[role="alert"]').exists()).toBe(false)
  })
  it('shows at most three unread chats on home and updates live', async () => {
    get.mockResolvedValue({ data: ['a', 'b', 'c', 'd'].map(id => ({ ...entry, id, title: `Чат ${id}` })), meta: { unread_total: 12 } })
    const home = await mountSuspended(UnreadChats)
    expect(home.findAll('li')).toHaveLength(3)
    expect(home.text()).not.toContain('Чат a')
    useChatsStore().remove('d')
    await flushPromises()
    expect(home.text()).toContain('Чат a')
    useChatsStore().chats = []
    await flushPromises()
    expect(home.text()).toContain('Непрочитанных сообщений нет')
  })
})
