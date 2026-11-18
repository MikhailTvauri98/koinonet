// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
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
const settings = { data: { church_name: 'Церковь', timezone: 'Europe/Moscow', reverb_key: 'key', vapid_public_key: '' } }
function makeChannel() {
  return { listen: vi.fn(), notification: vi.fn(), subscribed: vi.fn(), stopListening: vi.fn() }
}
function makeConnection() {
  const handlers = new Set<(change: { current: string }) => void>()
  return {
    state: 'connected',
    bind: vi.fn((_: string, callback: (change: { current: string }) => void) => handlers.add(callback)),
    unbind: vi.fn((_: string, callback: (change: { current: string }) => void) => handlers.delete(callback)),
    emit(current: string) { handlers.forEach(callback => callback({ current })) },
    get size() { return handlers.size },
  }
}
let healthy: boolean
let notificationsFail: boolean
let connection: ReturnType<typeof makeConnection>
let scope: EffectScope
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

async function status() {
  const { useRealtimeStatus } = await import('~/composables/useRealtimeStatus')
  return scope.run(() => useRealtimeStatus())!
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  vi.resetAllMocks()
  healthy = false
  notificationsFail = false
  connection = makeConnection()
  const channel = makeChannel()
  echo.mockImplementation(() => {
    if (!healthy) throw new Error('unavailable')
    return { private: () => channel, leave, connector: { pusher: { connection } } }
  })
  get.mockImplementation((path: string) => {
    if (path === '/settings') return Promise.resolve(settings)
    if (path === '/chats') return Promise.resolve({ data: [], meta: { unread_total: 0 } })
    if (notificationsFail) return Promise.reject(new Error('offline'))
    return Promise.resolve({ data: [], next_cursor: null, meta: { unread_count: 0 } })
  })
  scope = effectScope()
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

describe('useRealtimeStatus', () => {
  it('is online and idle without a connection error', async () => {
    const { state, failures } = await status()
    expect(state.value).toBe('online')
    expect(failures.value).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('turns a subscription error into reconnecting and retries after 2, 5, 15, 30 s, then every 30 s', async () => {
    const { state, failures } = await status()
    await useAuthStore().setMe(me('a'))
    expect(useChatsStore().connectionError).not.toBe('')
    expect(state.value).toBe('reconnecting')
    expect(failures.value).toBe(1)
    await flush(1999)
    expect(failures.value).toBe(1)
    await flush(1)
    expect(failures.value).toBe(2)
    await flush(4999)
    expect(failures.value).toBe(2)
    await flush(1)
    expect(failures.value).toBe(3)
    await flush(14999)
    expect(failures.value).toBe(3)
    await flush(1)
    expect(failures.value).toBe(4)
    await flush(30000)
    expect(failures.value).toBe(5)
    await flush(30000)
    expect(failures.value).toBe(6)
    expect(state.value).toBe('reconnecting')
  })

  it('goes online and resets failures when a retry succeeds', async () => {
    const { state, failures } = await status()
    await useAuthStore().setMe(me('a'))
    await flush(2000)
    expect(failures.value).toBe(2)
    healthy = true
    await flush(5000)
    expect(state.value).toBe('online')
    expect(failures.value).toBe(0)
    expect(useChatsStore().connectionError).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries a failed notifications load through the notifications store', async () => {
    healthy = true
    notificationsFail = true
    const { state, failures } = await status()
    await useAuthStore().setMe(me('a'))
    expect(useNotificationsStore().connectionError).not.toBe('')
    expect(state.value).toBe('reconnecting')
    notificationsFail = false
    await flush(2000)
    expect(useNotificationsStore().connectionError).toBe('')
    expect(state.value).toBe('online')
    expect(failures.value).toBe(0)
  })

  it('retry() runs an attempt at once and counts it', async () => {
    const { retry, failures } = await status()
    await useAuthStore().setMe(me('a'))
    const calls = echo.mock.calls.length
    retry()
    await flush(0)
    expect(echo.mock.calls.length).toBeGreaterThan(calls)
    expect(failures.value).toBe(2)
  })

  it('reset on logout clears the state and leaves no timers', async () => {
    const { state, failures } = await status()
    await useAuthStore().setMe(me('a'))
    expect(vi.getTimerCount()).toBe(1)
    useAuthStore().reset()
    await flush(0)
    expect(state.value).toBe('online')
    expect(failures.value).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    const calls = echo.mock.calls.length
    await flush(60000)
    expect(echo.mock.calls.length).toBe(calls)
  })

  it('ignores a retry that finishes after the session changed', async () => {
    const { failures } = await status()
    await useAuthStore().setMe(me('a'))
    let finish!: (value: unknown) => void
    get.mockImplementation((path: string) => path === '/chats'
      ? new Promise((resolve) => { finish = resolve })
      : Promise.resolve(path === '/settings' ? settings : { data: [], next_cursor: null, meta: { unread_count: 0 } }))
    await flush(2000)
    useAuthStore().reset()
    finish({ data: [], meta: { unread_total: 0 } })
    await flush(0)
    expect(failures.value).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops its timer and listeners when the last consumer goes away', async () => {
    await status()
    await useAuthStore().setMe(me('a'))
    expect(vi.getTimerCount()).toBe(1)
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
    const calls = echo.mock.calls.length
    await flush(60000)
    expect(echo.mock.calls.length).toBe(calls)
  })

  it('follows the browser offline and online events', async () => {
    healthy = true
    const { state } = await status()
    window.dispatchEvent(new Event('offline'))
    await flush(0)
    expect(state.value).toBe('offline')
    expect(vi.getTimerCount()).toBe(0)
    window.dispatchEvent(new Event('online'))
    await flush(0)
    expect(state.value).toBe('online')
  })

  it('follows the realtime connection state', async () => {
    healthy = true
    const { state } = await status()
    await useAuthStore().setMe(me('a'))
    expect(connection.size).toBe(1)
    connection.emit('unavailable')
    await flush(0)
    expect(state.value).toBe('reconnecting')
    connection.emit('connected')
    await flush(0)
    expect(state.value).toBe('online')
    scope.stop()
    expect(connection.size).toBe(0)
  })
})
