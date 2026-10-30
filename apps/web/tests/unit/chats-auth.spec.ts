// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore, type MeResponse } from '~/stores/auth'
import { useChatsStore } from '~/stores/chats'
import { useNotificationsStore } from '~/stores/notifications'

const { get, echo, leave } = vi.hoisted(() => ({ get: vi.fn(), echo: vi.fn(), leave: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get }))
mockNuxtImport('useEcho', () => echo)
mockNuxtImport('usePush', () => () => ({ setAccount: async () => {} }))
const me = (id: string): MeResponse => ({
  user: { id, phone: null, email: `${id}@test.local`, ical_url: 'https://church.test/calendar.ics' },
  person: { id: `p-${id}`, first_name: 'Иван', last_name: 'Иванов', patronymic: null, status: 'member' },
  permissions: { administrator: false, global: [], ministries: {} },
})
const notification = { id: 'n', category: 'announcements', title: 'Т', body: 'Б', url: '/', read_at: null, created_at: '2026-10-01T10:00:00Z' }
function makeChannel() {
  const handlers = new Map<string, Set<(value?: never) => unknown>>()
  const bind = (name: string, callback: (value?: never) => unknown) => {
    if (!handlers.has(name)) handlers.set(name, new Set())
    handlers.get(name)!.add(callback)
  }
  return {
    listen: vi.fn(bind), notification: vi.fn((callback: () => unknown) => bind('notification', callback)),
    subscribed: vi.fn((callback: () => unknown) => bind('.pusher:subscription_succeeded', callback)),
    stopListening: vi.fn((name: string, callback: () => unknown) => handlers.get(name)?.delete(callback)),
    async emit(name: string, value?: unknown) { await Promise.all([...handlers.get(name) ?? []].map(callback => callback(value as never))) },
  }
}
let channels: Map<string, ReturnType<typeof makeChannel>>
const list = { data: [], meta: { unread_total: 0 } }
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  channels = new Map()
  leave.mockImplementation((name: string) => channels.delete(name))
  echo.mockReturnValue({ private: (name: string) => {
    if (!channels.has(name)) channels.set(name, makeChannel())
    return channels.get(name)
  }, leave })
  get.mockImplementation((path: string) => Promise.resolve(path === '/settings'
    ? { data: { church_name: 'Церковь', timezone: 'Europe/Moscow', reverb_key: 'key', vapid_public_key: '' } }
    : path === '/chats' ? list : path === '/auth/me' ? me('a') : { data: [], next_cursor: null, meta: { unread_count: 0 } }))
})
describe('shared personal channel lifecycle', () => {
  it('keeps notification and chat handlers through same-account auth setup and reconnect', async () => {
    const auth = useAuthStore()
    await auth.setMe(me('a'))
    const channel = channels.get('user.a')!
    await auth.setMe(me('a'))
    expect(channel.notification).toHaveBeenCalledOnce()
    expect(channel.listen).toHaveBeenCalledTimes(3)
    await channel.emit('.pusher:subscription_succeeded')
    await channel.emit('.pusher:subscription_succeeded')
    await channel.emit('notification', notification)
    await channel.emit('.unread.total', { total: 7 })
    expect(useNotificationsStore().unreadCount).toBe(1)
    expect(useChatsStore().unreadTotal).toBe(7)
    expect(leave).not.toHaveBeenCalled()
  })
  it('clears both accounts, removes only chat listeners, ignores old callbacks and pending setup', async () => {
    const auth = useAuthStore()
    await auth.setMe(me('a'))
    const old = channels.get('user.a')!
    const oldChat = old.listen.mock.calls[1]![1]
    await auth.setMe(me('b'))
    expect(leave).toHaveBeenCalledWith('user.a')
    expect(old.stopListening).toHaveBeenCalledTimes(3)
    await old.emit('notification', notification)
    oldChat({ total: 99 } as never)
    expect(useNotificationsStore().items).toEqual([])
    expect(useChatsStore().unreadTotal).toBe(0)
    const current = channels.get('user.b')!
    await current.emit('notification', notification)
    await current.emit('.unread.total', { total: 4 })
    expect(useNotificationsStore().unreadCount).toBe(1)
    expect(useChatsStore().unreadTotal).toBe(4)
    auth.reset()
    expect(leave).toHaveBeenCalledWith('user.b')
    expect(useChatsStore().unreadTotal).toBe(0)
    let resolve!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise(accept => { resolve = accept }))
    const pending = auth.setMe(me('old'))
    auth.reset()
    resolve({ data: { church_name: 'Церковь', timezone: 'UTC' } })
    await pending
    expect(channels.has('user.old')).toBe(false)
  })
  it('reattaches chats after failed notification setup replaces the same-account channel', async () => {
    const auth = useAuthStore()
    await auth.setMe(me('a'))
    const old = channels.get('user.a')!
    // Simulate a retried notification setup replacing its owned channel.
    useNotificationsStore().unsubscribe()
    await auth.setMe(me('a'))
    const current = channels.get('user.a')!
    expect(current).not.toBe(old)
    await current.emit('notification', notification)
    await current.emit('.unread.total', { total: 5 })
    expect(useNotificationsStore().unreadCount).toBe(1)
    expect(useChatsStore().unreadTotal).toBe(5)
  })
  it('keeps auth usable and exposes retry when realtime acquisition fails', async () => {
    const auth = useAuthStore()
    echo.mockImplementation(() => { throw new Error('unavailable') })
    await expect(auth.setMe(me('a'))).resolves.toBeUndefined()
    expect(auth.user?.id).toBe('a')
    expect(useChatsStore().connectionError).toContain('Не удалось подключить чаты')
    const channel = makeChannel()
    echo.mockReturnValue({ private: () => channel, leave })
    await useChatsStore().retry()
    expect(useChatsStore().loaded).toBe(true)
    expect(useChatsStore().connectionError).toBe('')
    await channel.emit('notification', notification)
    await channel.emit('.chat.updated', { chat: {
      id: 'live', type: 'group', title: 'Живой чат', avatar_url: null, ministry_id: null, event_id: null,
      archived: false, unread_count: 6, muted_until: null, is_owner: false, last_message: null, last_message_at: null,
    } })
    await channel.emit('.unread.total', { total: 6 })
    expect(useChatsStore().unreadTotal).toBe(6)
    expect(useChatsStore().chats[0]!.title).toBe('Живой чат')
    expect(useNotificationsStore().unreadCount).toBe(1)
  })
})
