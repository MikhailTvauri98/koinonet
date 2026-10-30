// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import ChatScreen from '~/components/chat/ChatScreen.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(), listen: vi.fn(), stop: vi.fn(), leave: vi.fn(), fetch: vi.fn(), realtime: vi.fn(), upsert: vi.fn(), total: vi.fn(), observers: [] as { callback: IntersectionObserverCallback, targets: Element[], options?: IntersectionObserverInit }[] }))
const state = reactive({ user: { id: 'me' }, sessionVersion: 0, refreshRealtime: mocks.realtime, chats: [] as ReturnType<typeof card>[], lastChange: null as { id: string, removed: boolean } | null })
mockNuxtImport('useApi', () => () => ({ get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del }))
mockNuxtImport('useAuthStore', () => () => state)
mockNuxtImport('useChatsStore', () => () => ({ get chats() { return state.chats }, get lastChange() { return state.lastChange }, fetch: mocks.fetch, upsert: mocks.upsert, setUnreadTotal: mocks.total }))
const echo = { private: () => ({ listen: mocks.listen, stopListening: mocks.stop }), leave: mocks.leave }
mockNuxtImport('useEcho', () => () => echo)
function card(over = {}) { return { id: 'c1', title: 'Поездка', type: 'group', avatar_url: null, archived: false, muted_until: null, members: [{ user_id: 'me', full_name: 'Я' }], pinned_messages: [], can_write: true, can_moderate: false, can_manage_members: false, ...over } }
function msg(id = 'a', over = {}) { return { id, chat_id: 'c1', body: `текст ${id}`, cursor: btoa(`2026-12-01T10:00:00.000001Z|${id}`), created_at: '2026-12-01T10:00:00.000001Z', sender: { id: 'me', person: { id: 'p', full_name: null, photo_thumb_url: null } }, deleted: false, edited_at: null, reply_to: null, attachments: [], ...over } }
const mounted: { unmount: () => void }[] = []
async function mount() { const screen = await mountSuspended(ChatScreen, { props: { chatId: 'c1' } }); mounted.push(screen); await flushPromises(); return screen }
beforeEach(() => {
  vi.resetAllMocks(); state.user = { id: 'me' }; state.sessionVersion = 0; state.chats = []; state.lastChange = null; mocks.observers = []
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  vi.stubGlobal('IntersectionObserver', class {
    item: { callback: IntersectionObserverCallback, targets: Element[], options?: IntersectionObserverInit }
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.item = { callback, targets: [], options }; mocks.observers.push(this.item) }
    observe(target: Element) { this.item.targets.push(target) }
    disconnect() { this.item.targets = [] }
    unobserve() {}
  })
  mocks.get.mockImplementation((url: string) => Promise.resolve(url.endsWith('/messages') ? { data: [msg()], next_before: null, next_after: null } : { data: url.startsWith('/messages/') ? msg('live', { body: 'живое' }) : card() }))
  mocks.post.mockResolvedValue({ data: msg('sent') })
})
afterEach(() => { mounted.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); vi.unstubAllGlobals() })
it('renders hidden and erased senders distinctly and hydrates ID-only live signals', async () => {
  const screen = await mount()
  expect(screen.text()).toContain('Участник')
  const handlers = Object.fromEntries(mocks.listen.mock.calls) as Record<string, (p: unknown) => void>
  handlers['.message.sent']!({ message_id: 'live' }); await flushPromises()
  expect(mocks.get).toHaveBeenCalledWith('/messages/live')
  expect(screen.text()).toContain('живое')
  handlers['.message.deleted']!({ message_id: 'live' }); await flushPromises()
  expect(screen.text()).not.toContain('живое')
  expect(screen.text()).toContain('Сообщение удалено')
})
it('keeps failed drafts and replies, clears them only after success', async () => {
  const screen = await mount()
  await screen.get('[data-test="reply-a"]').trigger('click')
  await screen.get('[data-test="composer"]').setValue('Ответ')
  mocks.post.mockRejectedValueOnce(new Error('offline'))
  await screen.get('[data-test="send"]').trigger('click'); await flushPromises()
  expect((screen.get('[data-test="composer"]').element as HTMLTextAreaElement).value).toBe('Ответ')
  await screen.get('[data-test="send"]').trigger('click'); await flushPromises()
  expect(mocks.post).toHaveBeenLastCalledWith('/chats/c1/messages', { body: 'Ответ', media_ids: [], reply_to_id: 'a' })
  expect((screen.get('[data-test="composer"]').element as HTMLTextAreaElement).value).toBe('')
})
it('responds to personal metadata and membership flags', async () => {
  const screen = await mount()
  mocks.get.mockResolvedValue({ data: card({ title: 'Новое имя', archived: true }) })
  state.chats = [card({ title: 'Новое имя', archived: true })]; await flushPromises()
  expect(screen.text()).toContain('Новое имя')
  expect(screen.find('[data-test="composer"]').exists()).toBe(false)
  expect(screen.text()).toContain('Чат архивирован')
})
it('does not read on mount; reads only intersecting newest message in a visible member view', async () => {
  const screen = await mount()
  expect(mocks.post).not.toHaveBeenCalled()
  const newest = screen.get('[data-test="latest-message"]').element
  const observer = mocks.observers.find(o => o.targets.includes(newest))!
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  expect(observer.options?.root).toBeNull()
  observer.callback([{ target: newest, isIntersecting: true, intersectionRect: { width: 20, height: 20 } } as IntersectionObserverEntry], {} as IntersectionObserver)
  await flushPromises(); expect(mocks.post).not.toHaveBeenCalled()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(mocks.post).toHaveBeenCalledWith('/chats/c1/read', { message_id: 'a' })
})
it('cleans only its private chat channel and clears on account changes', async () => {
  const screen = await mount()
  state.sessionVersion++; state.user = { id: 'other' }; await flushPromises()
  expect(screen.text()).not.toContain('текст a')
  expect(mocks.leave).toHaveBeenCalledWith('chat.c1')
  expect(mocks.leave).not.toHaveBeenCalledWith('user.me')
})
it('preserves overlapping same-chat channel ownership', async () => {
  const first = await mount(); const second = await mount()
  first.unmount()
  expect(mocks.stop).toHaveBeenCalled()
  expect(mocks.leave).not.toHaveBeenCalled()
  second.unmount()
  expect(mocks.leave).toHaveBeenCalledExactlyOnceWith('chat.c1')
  mounted.length = 0
})
it('clears personal removal immediately and ignores a pending live resource', async () => {
  const screen = await mount()
  let resolve!: (data: unknown) => void
  mocks.get.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const handlers = Object.fromEntries(mocks.listen.mock.calls) as Record<string, (p: unknown) => void>
  handlers['.message.sent']!({ message_id: 'secret' })
  mocks.get.mockRejectedValue({ statusCode: 403 })
  state.lastChange = { id: 'c1', removed: true }; await flushPromises()
  resolve({ data: msg('secret', { body: 'secret' }) }); await flushPromises()
  expect(screen.text()).toContain('Чат недоступен')
  expect(screen.text()).not.toContain('secret')
  expect(screen.text()).not.toContain('текст a')
})
it('reauthorizes removed ministry members who can still read without membership', async () => {
  const screen = await mount()
  mocks.get.mockImplementation((url: string) => Promise.resolve(url.endsWith('/messages') ? { data: [msg()], next_before: null, next_after: null } : { data: card({ type: 'ministry', members: [], can_write: false }) }))
  state.lastChange = { id: 'c1', removed: true }; await flushPromises()
  expect(screen.text()).toContain('текст a')
  expect(screen.text()).toContain('Чат доступен только для чтения')
  expect(screen.find('[data-test="composer"]').exists()).toBe(false)
})
it('recovers initial history failure through the public retry button', async () => {
  mocks.get.mockImplementation((url: string) => url.endsWith('/messages') ? Promise.reject(new Error('offline')) : Promise.resolve({ data: card() }))
  const screen = await mount()
  expect(screen.text()).not.toContain('текст a')
  mocks.get.mockImplementation((url: string) => Promise.resolve(url.endsWith('/messages') ? { data: [msg()], next_before: null, next_after: null } : { data: card() }))
  await screen.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(screen.text()).toContain('текст a')
  expect(mocks.realtime).toHaveBeenCalledOnce()
  expect(mocks.get.mock.calls.filter(([url]) => url === '/chats/c1/messages')).toHaveLength(2)
})
it('keeps a send-failure draft across public history/realtime retry', async () => {
  const screen = await mount()
  await screen.get('[data-test="composer"]').setValue('Черновик')
  mocks.post.mockRejectedValueOnce(new Error('offline'))
  await screen.get('[data-test="send"]').trigger('click'); await flushPromises()
  await screen.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect((screen.get('[data-test="composer"]').element as HTMLTextAreaElement).value).toBe('Черновик')
})
it('does not overwrite personal unread events with a late read response', async () => {
  const screen = await mount()
  let resolve!: (data: unknown) => void
  mocks.post.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const newest = screen.get('[data-test="latest-message"]').element
  mocks.observers.find(o => o.targets.includes(newest))!.callback([{ target: newest, isIntersecting: true, intersectionRect: { width: 20, height: 20 } } as IntersectionObserverEntry], {} as IntersectionObserver)
  await flushPromises()
  state.chats = [card({ unread_count: 5 })]; await flushPromises()
  resolve({ unread_count: 0, unread_total: 0 }); await flushPromises()
  expect(mocks.total).not.toHaveBeenCalled()
  expect(mocks.fetch).toHaveBeenCalled()
})
it('clears on a current 403 and never reads a nonmember ministry view', async () => {
  mocks.get.mockImplementation((url: string) => Promise.resolve(url.endsWith('/messages') ? { data: [msg()], next_before: null, next_after: null } : { data: card({ type: 'ministry', members: [], can_write: false }) }))
  const screen = await mount()
  const newest = screen.get('[data-test="latest-message"]').element
  mocks.observers.find(o => o.targets.includes(newest))!.callback([{ target: newest, isIntersecting: true, intersectionRect: { width: 20, height: 20 } } as IntersectionObserverEntry], {} as IntersectionObserver)
  await flushPromises(); expect(mocks.post).not.toHaveBeenCalled()
  mocks.get.mockRejectedValueOnce({ statusCode: 403 })
  const handlers = Object.fromEntries(mocks.listen.mock.calls) as Record<string, (p: unknown) => void>
  handlers['.message.edited']!({ message_id: 'a' }); await flushPromises()
  expect(screen.text()).toContain('Чат недоступен')
  expect(screen.text()).not.toContain('текст a')
})
it('rejects zero-area viewport intersections', async () => {
  const screen = await mount()
  const newest = screen.get('[data-test="latest-message"]').element
  mocks.observers.find(o => o.targets.includes(newest))!.callback([{ target: newest, isIntersecting: true, intersectionRect: { width: 0, height: 0 } } as IntersectionObserverEntry], {} as IntersectionObserver)
  await flushPromises(); expect(mocks.post).not.toHaveBeenCalled()
})
it('invalidates an old chat snapshot when the reusable identity changes', async () => {
  let resolve!: (data: unknown) => void
  mocks.get.mockImplementation((url: string) => url === '/chats/c1/messages'
    ? new Promise(r => { resolve = r })
    : Promise.resolve(url.endsWith('/messages') ? { data: [msg('new', { chat_id: 'c2' })], next_before: null, next_after: null } : { data: card({ id: url.endsWith('c2') ? 'c2' : 'c1' }) }))
  const screen = await mount()
  await screen.setProps({ chatId: 'c2' }); await flushPromises()
  resolve({ data: [msg('private-old')], next_before: null, next_after: null }); await flushPromises()
  expect(screen.text()).toContain('текст new')
  expect(screen.text()).not.toContain('private-old')
  expect(mocks.leave).toHaveBeenCalledWith('chat.c1')
})
it('bounds read requests and sends only the newest forward visible boundary', async () => {
  const screen = await mount()
  vi.useFakeTimers()
  mocks.post.mockResolvedValue({ unread_count: 0, unread_total: 0 })
  const intersect = async () => {
    const newest = screen.get('[data-test="latest-message"]').element
    mocks.observers.findLast(o => o.targets.includes(newest))!.callback([{ target: newest, isIntersecting: true, intersectionRect: { width: 20, height: 20 } } as IntersectionObserverEntry], {} as IntersectionObserver)
    await vi.advanceTimersByTimeAsync(0)
  }
  await intersect()
  const handlers = Object.fromEntries(mocks.listen.mock.calls) as Record<string, (p: unknown) => void>
  mocks.get.mockImplementation((url: string) => Promise.resolve(url.startsWith('/messages/') ? { data: msg('z') } : { data: card() }))
  handlers['.message.sent']!({ message_id: 'z' }); await vi.advanceTimersByTimeAsync(0)
  await intersect()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1000)
  expect(mocks.post).toHaveBeenCalledTimes(2)
  expect(mocks.post).toHaveBeenLastCalledWith('/chats/c1/read', { message_id: 'z' })
  await intersect(); await vi.advanceTimersByTimeAsync(1000)
  expect(mocks.post).toHaveBeenCalledTimes(2)
  vi.useRealTimers()
})
it('does not restart a previous lifetime after realtime retry crosses an account switch', async () => {
  const screen = await mount()
  await screen.get('[data-test="composer"]').setValue('private draft')
  mocks.post.mockRejectedValueOnce(new Error('offline'))
  await screen.get('[data-test="send"]').trigger('click'); await flushPromises()
  let resolve!: () => void
  mocks.realtime.mockReturnValue(new Promise<void>(r => { resolve = r }))
  await screen.get('[role="alert"] button').trigger('click')
  expect(mocks.realtime).toHaveBeenCalledOnce()
  const requests = mocks.get.mock.calls.length
  state.sessionVersion++; state.user = { id: 'other' }; await flushPromises()
  resolve(); await flushPromises()
  expect(mocks.get).toHaveBeenCalledTimes(requests)
  expect(screen.text()).not.toContain('текст a')
  expect(screen.find('[data-test="composer"]').exists()).toBe(false)
})
it('edits only own messages and confirms deletion, while moderation offers pins', async () => {
  mocks.get.mockImplementation((url: string) => Promise.resolve(url.endsWith('/messages') ? { data: [msg(), msg('other', { sender: null })], next_before: null, next_after: null } : { data: card({ can_moderate: true }) }))
  mocks.patch.mockResolvedValue({ data: msg('a', { body: 'Исправлено' }) })
  const screen = await mount()
  expect(screen.text()).toContain('Удалённый человек')
  expect(screen.find('[data-test="edit-other"]').exists()).toBe(false)
  await screen.get('[data-test="edit-a"]').trigger('click')
  await screen.get('[data-test="composer"]').setValue('Исправлено')
  await screen.get('[data-test="send"]').trigger('click'); await flushPromises()
  expect(mocks.patch).toHaveBeenCalledWith('/messages/a', { body: 'Исправлено' })
  await screen.get('[data-test="delete-other"]').trigger('click')
  expect(mocks.del).not.toHaveBeenCalled()
  await screen.get('[role="alertdialog"] button').trigger('click'); await flushPromises()
  expect(mocks.del).toHaveBeenCalledWith('/messages/other')
  expect(screen.text()).toContain('Сообщение удалено')
})
