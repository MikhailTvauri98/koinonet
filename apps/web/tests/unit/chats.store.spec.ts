// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatsStore } from '~/stores/chats'

const { get, listen, stopListening, channel } = vi.hoisted(() => {
  const listen = vi.fn()
  const stopListening = vi.fn()
  return { get: vi.fn(), listen, stopListening, channel: { listen, stopListening } }
})
mockNuxtImport('useApi', () => () => ({ get }))
mockNuxtImport('useEcho', () => () => ({ private: () => channel }))
export const chat = (id: string, at: string | null = null, unread = 0) => ({
  id, type: 'group', title: id, avatar_url: null, ministry_id: null, event_id: null,
  archived: false, unread_count: unread, muted_until: null, is_owner: false,
  last_message: at ? { id: 'm', body_preview: 'Привет', deleted: false, created_at: at } : null, last_message_at: at,
})
const page = (data = [chat('a')], total = 0) => ({ data, meta: { unread_total: total } })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); get.mockResolvedValue(page()) })

describe('chats store', () => {
  it('loads the exact total and sorts full microsecond timestamps then ids, nulls last', async () => {
    get.mockResolvedValue(page([chat('z', '2026-12-01T10:00:00.123455Z'), chat('b'), chat('a', '2026-12-01T10:00:00.123456Z'), chat('c')], 7))
    const store = useChatsStore()
    await store.fetch()
    expect(store.chats.map(c => c.id)).toEqual(['a', 'z', 'c', 'b'])
    expect(store.unreadTotal).toBe(7)
    store.upsert(chat('z', '2026-12-01T10:00:00.123456Z'))
    expect(store.chats[0]!.id).toBe('z')
  })
  it('applies personal events, removes minimal tombstones and refreshes on reconnect', async () => {
    const store = useChatsStore()
    await store.subscribeUser('u1')
    const handlers = Object.fromEntries(listen.mock.calls) as Record<string, (value: unknown) => void>
    handlers['.chat.updated']!({ chat: chat('b', '2026-12-01T10:00:00Z', 2) })
    handlers['.chat.updated']!({ chat: { id: 'a' }, removed: true })
    handlers['.unread.total']!({ total: 2 })
    expect(store.chats.map(c => c.id)).toEqual(['b'])
    expect(store.unreadTotal).toBe(2)
    get.mockResolvedValue(page([chat('missed')], 3))
    handlers['.pusher:subscription_succeeded']!({})
    await vi.waitFor(() => expect(store.chats[0]!.id).toBe('missed'))
    expect(store.chats[0]!.id).toBe('missed')
    expect(store.unreadTotal).toBe(3)
  })
  it('does not let an in-flight snapshot overwrite live updates, removal or total', async () => {
    const store = useChatsStore()
    await store.subscribeUser('u1')
    const snapshot = deferred<ReturnType<typeof page>>()
    get.mockReturnValueOnce(snapshot.promise)
    const pending = store.fetch()
    store.remove('a')
    store.upsert(chat('live'))
    store.setUnreadTotal(8)
    snapshot.resolve(page([chat('a'), chat('stale')], 1))
    await pending
    expect(store.chats.map(c => c.id)).toEqual(['stale', 'live'])
    expect(store.unreadTotal).toBe(8)
  })
  it('ignores previous account HTTP responses and channel handlers and subscribes idempotently', async () => {
    const store = useChatsStore()
    await store.subscribeUser('u1')
    await store.subscribeUser('u1')
    expect(listen).toHaveBeenCalledTimes(3)
    const receive = listen.mock.calls[0]![1]
    const snapshot = deferred<ReturnType<typeof page>>()
    get.mockReturnValueOnce(snapshot.promise)
    const pending = store.fetch()
    await store.subscribeUser('u2')
    receive({ chat: chat('private') })
    snapshot.resolve(page([chat('old-private')], 9))
    await pending
    expect(store.chats.map(c => c.id)).toEqual(['a'])
    store.unsubscribeUser()
    expect(stopListening).toHaveBeenCalledWith('.chat.updated', expect.any(Function))
    receive({ chat: chat('private') })
    expect(store.chats).toEqual([])
    expect(store.unreadTotal).toBe(0)
  })
  it('keeps data on failed refresh and exposes a retryable error', async () => {
    const store = useChatsStore()
    await store.fetch()
    get.mockRejectedValueOnce(new Error('offline'))
    await store.fetch()
    expect(store.error).toContain('Не удалось загрузить чаты')
    expect(store.chats).toHaveLength(1)
    expect(store.loading).toBe(false)
    await store.fetch()
    expect(store.error).toBe('')
  })
  it('ignores an older same-account response after a newer request completes', async () => {
    const store = useChatsStore()
    const old = deferred<ReturnType<typeof page>>()
    get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([chat('new')], 4))
    const pending = store.fetch()
    await store.fetch()
    old.resolve(page([chat('old')], 9))
    await pending
    expect(store.chats.map(c => c.id)).toEqual(['new'])
    expect(store.unreadTotal).toBe(4)
  })
})
