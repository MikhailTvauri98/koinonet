// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPage from '~/pages/chats/[id].vue'
import ChatsIndex from '~/pages/chats/index.vue'
import ChatWorkspace from '~/components/chat/ChatWorkspace.vue'
import ChatList from '~/components/chat/ChatList.vue'
import UnreadChats from '~/components/chat/UnreadChats.vue'
import AppNav from '~/components/AppNav.vue'
import { useChatsStore, type ChatListItem } from '~/stores/chats'
import { grantPermissions } from '../support/permissions'

const { get, listen, leave } = vi.hoisted(() => ({ get: vi.fn(), listen: vi.fn(), leave: vi.fn() }))
mockNuxtImport('useEcho', () => () => ({ private: () => ({ listen, stopListening: vi.fn() }), leave }))
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
  it('filters only loaded titles without fetching and distinguishes no match from no chats', async () => {
    get.mockResolvedValue({ data: [entry, { ...entry, id: 'b', title: 'Молодёжь', last_message: { ...entry.last_message!, body_preview: 'Прославление' } }], meta: { unread_total: 6 } })
    const page = await mountSuspended(ChatsIndex)
    const calls = get.mock.calls.length
    await page.get('input[type="search"]').setValue('  ПРОСЛАВЛЕНИЕ ')
    expect(page.find('a[href="/chats/a"]').exists()).toBe(true)
    expect(page.find('a[href="/chats/b"]').exists()).toBe(false)
    expect(get.mock.calls).toHaveLength(calls)
    await page.get('input[type="search"]').setValue('несуществующий')
    expect(page.text()).toContain('Чаты не найдены')
    expect(page.text()).not.toContain('Чатов пока нет')
    await page.get('input[type="search"]').setValue('')
    expect(page.findAll('.chat-item')).toHaveLength(2)
  })
  it('marks only the selected chat as current', async () => {
    const list = await mountSuspended(ChatList, { props: { chats: [entry, { ...entry, id: 'b' }], selectedId: 'b' } })
    expect(list.get('a[href="/chats/b"]').attributes('aria-current')).toBe('page')
    expect(list.get('a[href="/chats/a"]').attributes('aria-current')).toBeUndefined()
  })
  it('offers only available new chat actions in the empty hint', async () => {
    grantPermissions({ global: ['people.view', 'chats.dm', 'chats.create_groups'] })
    const list = await mountSuspended(ChatList, { props: { chats: [] } })
    expect(list.text()).toContain('Новое сообщение')
    expect(list.text()).toContain('Новая группа')
    grantPermissions({ global: ['chats.dm'] })
    await flushPromises()
    expect(list.text()).not.toContain('Новое сообщение')
    expect(list.text()).not.toContain('карточку человека')
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

it('loads the available list independently from an already selected chat', async () => {
  let finish!: (value: unknown) => void
  get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const workspace = mount({ components: { ChatWorkspace }, template: '<Suspense><ChatWorkspace selected-id="direct"><p data-test="conversation">Сообщения выбранного чата</p></ChatWorkspace></Suspense>' })
  await flushPromises()
  try {
    expect(workspace.get('[data-test="conversation"]').text()).toBe('Сообщения выбранного чата')
    expect(workspace.text()).toContain('Загружаем чаты')
  } finally {
    finish({ data: [entry], meta: { unread_total: 3 } })
    await flushPromises()
    workspace.unmount()
  }
})

it('keeps real selected history and draft usable while list loading, failure and retry are independent', async () => {
  let rejectList!: (failure: unknown) => void
  const pending = new Promise((_, reject) => { rejectList = reject })
  const card = { ...entry, archived: false, members: [{ user_id: 'u-signed-in', full_name: 'Я' }], pinned_messages: [], can_write: true, can_moderate: false, can_manage_members: false }
  const message = { id: 'm1', chat_id: 'a', body: 'История выбранного чата', cursor: btoa('2026-12-01T10:00:00.000001Z|m1'), created_at: '2026-12-01T10:00:00.000001Z', sender: null, deleted: false, edited_at: null, reply_to: null, attachments: [] }
  let lists = 0
  get.mockImplementation((url: string) => url === '/chats' ? ++lists === 1 ? pending : Promise.resolve({ data: [{ ...entry, archived: false }], meta: { unread_total: 3 } }) : Promise.resolve(url.endsWith('/messages') ? { data: [message], next_before: null, next_after: null } : { data: card }))
  const page = await mountSuspended(ChatPage, { route: '/chats/a' })
  await flushPromises()
  expect(page.get('.chat-header h1').text()).toBe('Прославление')
  expect(page.get('.message-list').text()).toContain('История выбранного чата')
  expect(page.get('.chat-workspace__list').text()).toContain('Загружаем чаты')
  await page.get('[data-test="composer"]').setValue('Сохраняемый черновик')
  rejectList(new Error('offline')); await flushPromises()
  expect(page.get('.chat-workspace__list [role="alert"]').text()).toContain('Не удалось загрузить чаты')
  expect(page.get('.message-list').text()).toContain('История выбранного чата')
  expect((page.get('[data-test="composer"]').element as HTMLTextAreaElement).value).toBe('Сохраняемый черновик')
  await page.get('.chat-workspace__list [role="alert"] button').trigger('click'); await flushPromises()
  expect(page.find('.chat-workspace__list [role="alert"]').exists()).toBe(false)
  expect(page.find('.chat-workspace__list a[href="/chats/a"]').exists()).toBe(true)
  expect((page.get('[data-test="composer"]').element as HTMLTextAreaElement).value).toBe('Сохраняемый черновик')
  expect(listen.mock.calls.filter(([event]) => event === '.message.sent')).toHaveLength(1)
})

it('normalizes multiline preview spacing without shortening the chat title', async () => {
  const title = 'Подготовка воскресного служения и совместного обеда'
  const list = await mountSuspended(ChatList, { props: { chats: [{ ...entry, title, last_message: { ...entry.last_message!, body_preview: '  Подготовим\nзал\r\nдля\tвоскресного   служения.  ' } }] } })
  expect(list.get('.chat-item__preview').text()).toBe('Подготовим зал для воскресного служения.')
  expect(list.get('.chat-item__content strong').text()).toBe(title)
})
