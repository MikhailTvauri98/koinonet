// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationsStore } from '~/stores/notifications'
import { useSettingsStore } from '~/stores/settings'

const { get, post, notification, subscribed, leave, echo, refreshMe } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), notification: vi.fn(), subscribed: vi.fn(), leave: vi.fn(), echo: vi.fn(), refreshMe: vi.fn(),
}))
mockNuxtImport('useApi', () => () => ({ get, post }))
mockNuxtImport('useEcho', () => echo)
mockNuxtImport('useAuthStore', () => () => ({ fetchMe: refreshMe }))

const entry = (id: string, read_at: string | null = null) => ({ id, category: 'announcements', title: 'Т', body: 'Б', url: `/announcements/${id}`, read_at, created_at: '2026-10-01T10:00:00Z' })
const page = (ids: string[], count = ids.length, cursor: string | null = null) => ({ data: ids.map(id => entry(id)), next_cursor: cursor, meta: { unread_count: count } })
const settings = { data: { church_name: 'Церковь', timezone: 'Europe/Moscow', reverb_key: 'public-key', vapid_public_key: 'vapid' } }

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  echo.mockReturnValue({ private: vi.fn(() => ({ notification, subscribed })), leave })
  get.mockImplementation((path: string) => Promise.resolve(path === '/settings' ? settings : page([])))
  registerEndpoint('/api/v1/settings', () => settings)
})

describe('notification center store', () => {
  it('loads a first page then appends by cursor without duplicates', async () => {
    get.mockResolvedValueOnce(page(['a'], 2, 'c2')).mockResolvedValueOnce(page(['a', 'b'], 2))
    const store = useNotificationsStore()
    await store.fetch(true)
    await store.fetch()
    expect(get).toHaveBeenLastCalledWith('/notifications', { cursor: 'c2' })
    expect(store.items.map(n => n.id)).toEqual(['a', 'b'])
    expect(store.unreadCount).toBe(2)
    expect(store.nextCursor).toBeNull()
  })

  it('marks optimistically, uses server counts and restores unread after failure', async () => {
    get.mockResolvedValue(page(['a', 'b']))
    const store = useNotificationsStore()
    await store.fetch(true)
    let finish!: (value: { unread_count: number }) => void
    post.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const pending = store.markRead(['a'])
    expect(store.items[0]!.read_at).not.toBeNull()
    finish({ unread_count: 1 })
    await pending
    expect(post).toHaveBeenCalledWith('/notifications/read', { ids: ['a'] })
    post.mockRejectedValueOnce(new Error('offline'))
    await expect(store.markAllRead()).rejects.toThrow('offline')
    expect(store.items[1]!.read_at).toBeNull()
    expect(store.unreadCount).toBe(1)
    post.mockResolvedValueOnce({ unread_count: 0 })
    await store.markAllRead()
    expect(post).toHaveBeenLastCalledWith('/notifications/read', { all: true })
    expect(store.unreadCount).toBe(0)
  })

  it('loads settings before Echo and refreshes unread initially and on resubscription', async () => {
    const store = useNotificationsStore()
    get.mockImplementation((path: string) => Promise.resolve(path === '/settings' ? settings : page(['existing'], 4)))
    echo.mockImplementation(() => {
      expect(useSettingsStore().reverbKey).toBe('public-key')
      return { private: vi.fn(() => ({ notification, subscribed })), leave }
    })
    await store.subscribe('u1')
    expect(store.unreadCount).toBe(4)
    const connected = subscribed.mock.calls[0]![0] as () => Promise<void>
    await connected()
    get.mockImplementation((path: string) => Promise.resolve(path === '/settings' ? settings : page(['missed'], 5)))
    await connected()
    expect(store.items[0]!.id).toBe('missed')
    expect(store.unreadCount).toBe(5)
    expect(refreshMe).toHaveBeenCalledOnce()
  })

  it('handles standard Echo notification payloads, deduplicates and excludes chat', async () => {
    const store = useNotificationsStore()
    await store.subscribe('u1')
    const receive = notification.mock.calls[0]![0] as (n: unknown) => void
    receive({ ...entry('live'), type: 'notification.created' })
    receive({ ...entry('live'), type: 'notification.created' })
    receive({ ...entry('chat'), category: 'chat', type: 'notification.created' })
    expect(store.items.map(n => n.id)).toEqual(['live'])
    expect(store.unreadCount).toBe(1)
  })

  it('clears on account change and ignores the previous channel and in-flight response', async () => {
    const store = useNotificationsStore()
    await store.subscribe('u1')
    const receive = notification.mock.calls[0]![0] as (n: unknown) => void
    let finish!: (value: ReturnType<typeof page>) => void
    get.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const pending = store.fetch(true)
    await store.subscribe('u2')
    receive(entry('private-u1'))
    finish(page(['old-private']))
    await pending
    expect(leave).toHaveBeenCalledWith('user.u1')
    expect(store.items).toEqual([])
    expect(store.unreadCount).toBe(0)
    store.push(entry('current'))
    store.unsubscribe()
    expect(leave).toHaveBeenCalledWith('user.u2')
    expect(store.items).toEqual([])
  })

  it('does not restore private read results after logout', async () => {
    const store = useNotificationsStore()
    await store.subscribe('u1')
    store.push(entry('a'))
    let finish!: (value: { unread_count: number }) => void
    post.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const pending = store.markRead(['a'])
    store.unsubscribe()
    finish({ unread_count: 99 })
    await pending
    expect(store.unreadCount).toBe(0)
    expect(store.items).toEqual([])
  })
})
