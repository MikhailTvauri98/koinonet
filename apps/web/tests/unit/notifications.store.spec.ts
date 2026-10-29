// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

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

  it.each([
    ['single', 'during'], ['single', 'after'], ['all', 'during'], ['all', 'after'],
  ] as const)('does not let an older GET undo %s read when it resolves %s the mutation', async (kind, timing) => {
    const store = useNotificationsStore()
    get.mockResolvedValueOnce(page(['a', 'b'], 2, 'c2'))
    await store.fetch(true)
    const snapshot = deferred<ReturnType<typeof page>>()
    const mutation = deferred<{ unread_count: number }>()
    const readAt = '2026-10-01T12:00:00Z'
    const confirmedCount = kind === 'all' ? 0 : 1
    get.mockReturnValueOnce(snapshot.promise).mockResolvedValueOnce({
      data: [entry('a', readAt), entry('b', kind === 'all' ? readAt : null)],
      next_cursor: 'c3', meta: { unread_count: confirmedCount },
    })
    post.mockReturnValueOnce(mutation.promise)
    const fetching = store.fetch(true)
    const reading = kind === 'all' ? store.markAllRead() : store.markRead(['a'])
    if (timing === 'during') {
      snapshot.resolve(page(['a', 'b'], 2, 'stale-cursor'))
      await flushPromises()
      const duringReadAt = store.items[0]!.read_at
      const duringCount = store.unreadCount
      mutation.resolve({ unread_count: confirmedCount })
      await Promise.all([fetching, reading])
      expect(duringReadAt).not.toBeNull()
      expect(duringCount).toBe(confirmedCount)
    } else {
      mutation.resolve({ unread_count: confirmedCount })
      await reading
      snapshot.resolve(page(['a', 'b'], 2, 'stale-cursor'))
      await fetching
    }
    expect(store.items[0]!.read_at).not.toBeNull()
    expect(store.items[1]!.read_at === null).toBe(kind === 'single')
    expect(store.unreadCount).toBe(confirmedCount)
    expect(store.nextCursor).toBe('c3')
    expect(store.loading).toBe(false)
    expect(store.marking).toBe(false)
  })

  it('retries crossed pagination using the same cursor after read rollback', async () => {
    const store = useNotificationsStore()
    get.mockResolvedValueOnce(page(['a'], 2, 'c2'))
    await store.fetch(true)
    const snapshot = deferred<ReturnType<typeof page>>()
    const mutation = deferred<{ unread_count: number }>()
    get.mockReturnValueOnce(snapshot.promise).mockResolvedValueOnce(page(['b'], 2, 'c3'))
    post.mockReturnValueOnce(mutation.promise)
    const fetching = store.fetch()
    const reading = store.markRead(['a'])
    const failedRead = expect(reading).rejects.toThrow('offline')
    mutation.reject(new Error('offline'))
    await failedRead
    snapshot.resolve(page(['b'], 2, 'stale-cursor'))
    await fetching
    expect(get).toHaveBeenLastCalledWith('/notifications', { cursor: 'c2' })
    expect(store.items.map(n => [n.id, n.read_at])).toEqual([['a', null], ['b', null]])
    expect(store.nextCursor).toBe('c3')
    expect(store.unreadCount).toBe(2)
    expect(store.loading).toBe(false)
    expect(store.marking).toBe(false)
  })

  it('keeps the read state and cursor retryable when a replacement page fails', async () => {
    const store = useNotificationsStore()
    get.mockResolvedValueOnce(page(['a'], 2, 'c2'))
    await store.fetch(true)
    const snapshot = deferred<ReturnType<typeof page>>()
    get.mockReturnValueOnce(snapshot.promise).mockRejectedValueOnce(new Error('offline'))
    const fetching = store.fetch()
    post.mockResolvedValueOnce({ unread_count: 1 })
    await store.markRead(['a'])
    snapshot.resolve(page(['b'], 2, 'stale-cursor'))
    await fetching
    expect(store.items[0]!.read_at).not.toBeNull()
    expect(store.unreadCount).toBe(1)
    expect(store.nextCursor).toBe('c2')
    expect(store.error).toContain('Не удалось загрузить уведомления')
    expect(store.loading).toBe(false)
    get.mockResolvedValueOnce(page(['b'], 1, 'c3'))
    await store.fetch()
    expect(get).toHaveBeenLastCalledWith('/notifications', { cursor: 'c2' })
    expect(store.items.map(n => n.id)).toEqual(['a', 'b'])
    expect(store.items[0]!.read_at).not.toBeNull()
    expect(store.nextCursor).toBe('c3')
    expect(store.error).toBe('')
  })

  it('releases a snapshot waiting for a read on logout and ignores its old mutation', async () => {
    const store = useNotificationsStore()
    await store.subscribe('u1')
    store.push(entry('private'))
    const snapshot = deferred<ReturnType<typeof page>>()
    const mutation = deferred<{ unread_count: number }>()
    get.mockReturnValueOnce(snapshot.promise)
    post.mockReturnValueOnce(mutation.promise)
    const fetching = store.fetch(true)
    const reading = store.markAllRead()
    snapshot.resolve(page(['private']))
    await flushPromises()
    store.unsubscribe()
    await fetching
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([])
    mutation.resolve({ unread_count: 9 })
    await reading
    expect(store.unreadCount).toBe(0)
    expect(store.marking).toBe(false)
  })
})
