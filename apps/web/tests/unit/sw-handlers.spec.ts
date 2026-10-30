import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { notificationOptions, pickWindow, shouldShow } from '~/sw/handlers'

vi.mock('workbox-core', () => ({ clientsClaim: vi.fn() }))
vi.mock('workbox-precaching', () => ({ cleanupOutdatedCaches: vi.fn(), createHandlerBoundToURL: vi.fn(), precacheAndRoute: vi.fn() }))
vi.mock('workbox-routing', () => ({ NavigationRoute: vi.fn(), registerRoute: vi.fn() }))

describe('service worker helpers', () => {
  it('matches only a canonical same-origin chat URL with its category and collapse tag', () => {
    const payload = { category: 'chat', tag: 'chat-c1', url: '/chats/c1' }
    expect(shouldShow(payload, ['https://church.test/chats/c1'], 'https://church.test')).toBe(false)
    for (const url of ['https://evil.test/chats/c1', 'https://church.test/other/chats/c1', 'https://church.test/chats/c10', 'https://church.test/chats/c1?other']) {
      expect(shouldShow(payload, [url], 'https://church.test')).toBe(true)
    }
    expect(shouldShow({ ...payload, category: 'announcement' }, ['https://church.test/chats/c1'], 'https://church.test')).toBe(true)
    expect(shouldShow({ ...payload, url: 'https://evil.test/chats/c1' }, ['https://church.test/chats/c1'], 'https://church.test')).toBe(true)
  })
  it('maps top-level URL into notification data and retains display fields', () => {
    expect(notificationOptions({ title: 'Собрание', body: 'В 10:00', tag: 'announcement-a1', url: '/announcements/a1', icon: '/icons/icon-192.png' })).toEqual({
      title: 'Собрание', body: 'В 10:00', tag: 'announcement-a1', icon: '/icons/icon-192.png', data: { url: '/announcements/a1' }, renotify: true,
    })
  })
  it('falls back to a generic title, icon and root URL', () => {
    const options = notificationOptions({})
    expect(options).toMatchObject({ title: 'Церковь', icon: '/icons/icon-192.png', data: { url: '/' } })
    expect(existsSync(resolve('public', options.icon!.slice(1)))).toBe(true)
  })
  it('only requests renotify for tagged notifications, as required by the browser', () => {
    expect(notificationOptions({}).renotify).toBe(false)
  })
  it('prefers the window already at the target route then reuses any window', () => {
    const other = { url: 'https://church.test/people', focus: vi.fn(), navigate: vi.fn() }
    const target = { ...other, url: 'https://church.test/announcements/a1' }
    expect(pickWindow([other, target], '/announcements/a1')).toBe(target)
    expect(pickWindow([other], '/announcements/a1')).toBe(other)
    expect(pickWindow([], '/announcements/a1')).toBeNull()
  })
  it('prefers the same chat pathname even with a query or fragment', () => {
    const other = { url: 'https://church.test/people', focus: vi.fn(), navigate: vi.fn() }
    const same = { ...other, url: 'https://church.test/chats/c1?from=list#latest' }
    expect(pickWindow([other, same], '/chats/c1')).toBe(same)
  })
})

describe('registered service worker events', () => {
  const showNotification = vi.fn()
  const matchAll = vi.fn()
  const openWindow = vi.fn()
  const getClient = vi.fn()
  const listeners = new Map<string, (event: never) => void>()
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    listeners.clear()
    vi.stubGlobal('self', {
      __WB_MANIFEST: [], skipWaiting: vi.fn(), location: { origin: 'https://church.test' },
      registration: { showNotification }, clients: { matchAll, openWindow, get: getClient },
      addEventListener: (name: string, handler: (event: never) => void) => listeners.set(name, handler),
    })
    await import('~/sw')
  })
  afterEach(() => vi.unstubAllGlobals())

  async function dispatch(name: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> | undefined
    expect(listeners.has(name)).toBe(true)
    listeners.get(name)!({ ...event, waitUntil: (promise: Promise<unknown>) => { pending = promise } } as never)
    await pending
  }
  it('shows actual push fields and top-level navigation URL', async () => {
    await dispatch('push', { data: { json: () => ({ title: 'Собрание', body: 'В 10:00', tag: 'announcement-a1', url: '/announcements/a1' }) } })
    expect(showNotification).toHaveBeenCalledWith('Собрание', expect.objectContaining({ body: 'В 10:00', tag: 'announcement-a1', data: { url: '/announcements/a1' } }))
  })
  it('queries a visible embedded chat afresh even in a cold worker and suppresses its push', async () => {
    const client = { id: 'tab', type: 'window', url: 'https://church.test/ministries/m1/chat', visibilityState: 'visible', postMessage: vi.fn((_query, ports) => ports[0].postMessage({ chatId: 'c1', url: 'https://church.test/ministries/m1/chat' })) }
    matchAll.mockResolvedValue([client])
    getClient.mockResolvedValue(client)
    await dispatch('push', { data: { json: () => ({ category: 'chat', tag: 'chat-c1', url: '/chats/c1' }) } })
    expect(client.postMessage).toHaveBeenCalledOnce()
    expect(showNotification).not.toHaveBeenCalled()
  })
  it('shows chat pushes for hidden clients without querying them', async () => {
    const client = { id: 'tab', url: 'https://church.test/chats/c1', visibilityState: 'hidden', postMessage: vi.fn() }
    matchAll.mockResolvedValue([client])
    await dispatch('push', { data: { json: () => ({ category: 'chat', tag: 'chat-c1', url: '/chats/c1' }) } })
    expect(client.postMessage).not.toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalledWith('Церковь', expect.objectContaining({ tag: 'chat-c1', renotify: true }))
  })
  it.each(['silence', 'throw', 'wrong-chat', 'wrong-url', 'hidden-later', 'route-later', 'missing-client'])('shows a chat push on an unsafe or missing fresh response: %s', async (failure) => {
    const client = { id: 'tab', type: 'window', url: 'https://church.test/chats/c1', visibilityState: 'visible', postMessage: vi.fn((_query, ports) => {
      if (failure === 'throw') throw new Error('closed')
      if (failure === 'silence') return
      ports[0].postMessage({ chatId: failure === 'wrong-chat' ? 'c2' : 'c1', url: failure === 'wrong-url' ? 'https://evil.test/chats/c1' : 'https://church.test/chats/c1' })
    }) }
    matchAll.mockResolvedValue([client])
    getClient.mockResolvedValue(failure === 'missing-client' ? undefined : { ...client, visibilityState: failure === 'hidden-later' ? 'hidden' : 'visible', url: failure === 'route-later' ? 'https://church.test/people' : client.url })
    await dispatch('push', { data: { json: () => ({ category: 'chat', tag: 'chat-c1', url: '/chats/c1' }) } })
    expect(showNotification).toHaveBeenCalledOnce()
  })
  it('falls back to root for an external notification click', async () => {
    matchAll.mockResolvedValue([])
    await dispatch('notificationclick', { notification: { close: vi.fn(), data: { url: 'https://evil.test/chats/c1' } } })
    expect(openWindow).toHaveBeenCalledWith('/')
  })
  it.each([undefined, { json: () => { throw new Error('bad JSON') } }, { json: () => null }])('shows a generic notification for missing or malformed data', async (data) => {
    await dispatch('push', { data })
    expect(showNotification).toHaveBeenCalledWith('Церковь', expect.objectContaining({ data: { url: '/' } }))
  })
  it('waits for navigation before focusing the existing window', async () => {
    const focus = vi.fn()
    const navigate = vi.fn(async () => { expect(focus).not.toHaveBeenCalled() })
    matchAll.mockResolvedValue([{ url: 'https://church.test/people', focus, navigate }])
    const close = vi.fn()
    await dispatch('notificationclick', { notification: { close, data: { url: '/announcements/a1' } } })
    expect(close).toHaveBeenCalledOnce()
    expect(matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
    expect(navigate).toHaveBeenCalledWith('/announcements/a1')
    expect(focus).toHaveBeenCalledOnce()
    expect(openWindow).not.toHaveBeenCalled()
  })
  it('opens the target in a new window when none are open', async () => {
    matchAll.mockResolvedValue([])
    await dispatch('notificationclick', { notification: { close: vi.fn(), data: { url: '/announcements/a1' } } })
    expect(openWindow).toHaveBeenCalledWith('/announcements/a1')
  })
  it('uses the root route for a notification without navigation data', async () => {
    matchAll.mockResolvedValue([])
    await dispatch('notificationclick', { notification: { close: vi.fn() } })
    expect(openWindow).toHaveBeenCalledWith('/')
  })
})
