// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore, type MeResponse } from '~/stores/auth'
import { usePush } from '~/composables/usePush'

const { get, post, remove } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn() }))
mockNuxtImport('useApi', () => () => ({ get, post, delete: remove }))
mockNuxtImport('useNotificationsStore', () => () => ({ subscribe: async () => {}, unsubscribe: () => {} }))

const me = (id: string): MeResponse => ({
  user: { id, phone: null, email: `${id}@test.local`, ical_url: `https://church.test/${id}.ics` },
  person: { id: `p-${id}`, first_name: 'Иван', last_name: 'Иванов', patronymic: null, status: 'member' },
  permissions: { administrator: false, global: [], ministries: {} },
})
const json = { endpoint: 'https://push.example/device', keys: { p256dh: 'P', auth: 'A' } }
const browserUnsubscribe = vi.fn()
const requestPermission = vi.fn()
const subscription = { endpoint: json.endpoint, toJSON: () => json, unsubscribe: browserUnsubscribe }
let retained: typeof subscription | null
let serverOwner: string | null
let authenticated: string
const getRegistration = vi.fn()

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  retained = subscription
  serverOwner = 'A'
  authenticated = 'A'
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission })
  vi.stubGlobal('PushManager', vi.fn())
  vi.stubGlobal('navigator', { userAgent: 'Chrome Android', serviceWorker: { getRegistration, ready: new Promise(() => {}) } })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  getRegistration.mockResolvedValue({ active: {}, pushManager: { getSubscription: async () => retained } })
  browserUnsubscribe.mockImplementation(async () => { retained = null; return true })
  get.mockImplementation(async () => me(authenticated))
  post.mockImplementation(async (path: string) => {
    if (path === '/push-subscriptions') serverOwner = authenticated
    if (path === '/auth/login') return me(authenticated)
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('coordinated authentication and browser push', () => {
  it('rebinds a retained endpoint for an initially restored identity before marking it enabled', async () => {
    authenticated = 'B'
    const auth = useAuthStore()
    await auth.fetchMe()
    expect(serverOwner).toBe('B')
    expect(usePush().subscribed.value).toBe(true)
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('invalidates A after a real fetchMe 401 and does not show A push as enabled after login B', async () => {
    const auth = useAuthStore()
    await auth.setMe(me('A'))
    get.mockRejectedValueOnce({ statusCode: 401 })
    await auth.fetchMe()
    authenticated = 'B'
    await auth.login('B@test.local', 'secret', false)
    expect(auth.user?.id).toBe('B')
    expect(retained).toBeNull()
    expect(usePush().subscribed.value).toBe(false)
    expect(browserUnsubscribe).toHaveBeenCalled()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('recreates a pruned server row on restored authentication with the retained endpoint', async () => {
    serverOwner = null
    await useAuthStore().fetchMe()
    expect(serverOwner).toBe('A')
    expect(usePush().subscribed.value).toBe(true)
  })

  it('invalidates the old endpoint on failed ownership registration without breaking login', async () => {
    authenticated = 'B'
    post.mockImplementation(async (path: string) => {
      if (path === '/push-subscriptions') throw new Error('offline')
      return me('B')
    })
    const auth = useAuthStore()
    await auth.login('B@test.local', 'secret', false)
    expect(auth.user?.id).toBe('B')
    expect(retained).toBeNull()
    expect(usePush().subscribed.value).toBe(false)
  })

  it('surfaces double failure globally and permits a later explicit retry', async () => {
    post.mockRejectedValueOnce(new Error('offline'))
    browserUnsubscribe.mockRejectedValueOnce(new Error('browser unavailable'))
    await useAuthStore().setMe(me('A'))
    expect(usePush().subscribed.value).toBe(false)
    expect(usePush().error.value).toContain('Не удалось')
    await usePush().retry()
    expect(usePush().error.value).toBe('')
    expect(usePush().subscribed.value).toBe(true)
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('does not let a stale successful rebind mark another identity enabled', async () => {
    let finish!: () => void
    post.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const auth = useAuthStore()
    const first = auth.setMe(me('A'))
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/push-subscriptions', expect.anything()))
    auth.reset()
    authenticated = 'B'
    const second = auth.setMe(me('B'))
    expect(usePush().subscribed.value).toBe(false)
    finish()
    await Promise.all([first, second])
    expect(retained).toBeNull()
    expect(usePush().subscribed.value).toBe(false)
    expect(auth.user?.id).toBe('B')
  })

  it('keeps a stale rejected rebind from poisoning the next account or enabling its old endpoint', async () => {
    let fail!: (reason: Error) => void
    post.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
    const auth = useAuthStore()
    const first = auth.setMe(me('A'))
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'))
    auth.reset()
    authenticated = 'B'
    const second = auth.setMe(me('B'))
    fail(new Error('offline'))
    await Promise.all([first, second])
    expect(auth.user?.id).toBe('B')
    expect(retained).toBeNull()
    expect(usePush().subscribed.value).toBe(false)
    expect(usePush().error.value).toBe('')
  })

  it('does not let an open permission prompt block logout or subscribe a later identity', async () => {
    retained = null
    let finish!: (permission: NotificationPermission) => void
    requestPermission.mockImplementation(() => new Promise<NotificationPermission>(resolve => { finish = resolve }))
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    const auth = useAuthStore()
    await auth.setMe(me('A'))
    const enabling = usePush().subscribe()
    await auth.logout()
    authenticated = 'B'
    await auth.setMe(me('B'))
    post.mockClear()
    finish('granted')
    await enabling
    expect(post).not.toHaveBeenCalled()
    expect(usePush().subscribed.value).toBe(false)
  })

  it('reports an unreadable browser subscription and retries without a permission prompt', async () => {
    getRegistration.mockRejectedValueOnce(new Error('browser unavailable'))
    await useAuthStore().setMe(me('A'))
    expect(usePush().error.value).toContain('Не удалось')
    expect(usePush().subscribed.value).toBe(false)
    await usePush().retry()
    expect(usePush().subscribed.value).toBe(true)
    expect(usePush().error.value).toBe('')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('does not deadlock a reset called from the in-flight HTTP 401 handler', async () => {
    const auth = useAuthStore()
    post.mockImplementationOnce(async () => { auth.reset(); throw { statusCode: 401 } })
    await auth.setMe(me('A'))
    await vi.waitFor(() => expect(retained).toBeNull())
    expect(auth.user).toBeNull()
    expect(usePush().subscribed.value).toBe(false)
  })

  it('continues browser teardown and real logout for exactly the missing-subscription domain response', async () => {
    const auth = useAuthStore()
    await auth.setMe(me('A'))
    remove.mockRejectedValue({ statusCode: 422, data: { code: 'push.subscription_not_found' } })
    post.mockClear()
    await auth.logout()
    expect(retained).toBeNull()
    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(auth.user).toBeNull()
  })

  it.each([
    { statusCode: 422, data: { code: 'other.validation' } },
    { statusCode: 500, data: { code: 'push.subscription_not_found' } },
    new Error('offline'),
  ])('preserves authentication and browser subscription for other teardown failures: %j', async (failure) => {
    const auth = useAuthStore()
    await auth.setMe(me('A'))
    post.mockClear()
    remove.mockRejectedValue(failure)
    await expect(auth.logout()).rejects.toBe(failure)
    expect(post).not.toHaveBeenCalled()
    expect(retained).toBe(subscription)
    expect(auth.user?.id).toBe('A')
  })

  it('keeps authentication when real logout fails after missing-row browser teardown', async () => {
    const auth = useAuthStore()
    await auth.setMe(me('A'))
    remove.mockRejectedValue({ statusCode: 422, data: { code: 'push.subscription_not_found' } })
    post.mockRejectedValueOnce(new Error('logout offline'))
    await expect(auth.logout()).rejects.toThrow('logout offline')
    expect(retained).toBeNull()
    expect(auth.user?.id).toBe('A')
  })

  it('does not perform A teardown or logout under B after a deferred browser lookup', async () => {
    const auth = useAuthStore()
    await auth.setMe(me('A'))
    let finish!: (registration: unknown) => void
    getRegistration.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const leaving = auth.logout()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    get.mockRejectedValueOnce({ statusCode: 401 })
    await auth.fetchMe()
    authenticated = 'B'
    const entering = auth.setMe(me('B'))
    post.mockClear()
    remove.mockClear()
    finish({ pushManager: { getSubscription: async () => subscription } })
    await Promise.all([leaving, entering])
    expect(remove).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalledWith('/auth/logout')
    expect(auth.user?.id).toBe('B')
    expect(retained).toBeNull()
  })

  it.each([200, 401])('does not clear B after a late server logout %i response initiated by A', async (status) => {
    const auth = useAuthStore()
    await auth.setMe(me('A'))
    let finish!: () => void
    post.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
      finish = () => status === 200 ? resolve() : reject({ statusCode: 401 })
    }))
    const leaving = auth.logout()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    auth.reset()
    authenticated = 'B'
    await auth.setMe(me('B'))
    finish()
    await leaving
    expect(auth.user?.id).toBe('B')
  })

  it('does not execute a queued A teardown under B', async () => {
    let finish!: () => void
    post.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const auth = useAuthStore()
    const first = auth.setMe(me('A'))
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    const leaving = auth.logout()
    auth.reset()
    authenticated = 'B'
    const entering = auth.setMe(me('B'))
    finish()
    await Promise.all([first, leaving, entering])
    expect(remove).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalledWith('/auth/logout')
    expect(auth.user?.id).toBe('B')
  })

  it('finishes browser teardown when the actual HTTP 401 handler resets during deletion', async () => {
    const auth = useAuthStore()
    await auth.setMe(me('A'))
    remove.mockImplementationOnce(async () => { auth.reset(); throw { statusCode: 401 } })
    await auth.logout()
    expect(auth.user).toBeNull()
    expect(retained).toBeNull()
    expect(usePush().subscribed.value).toBe(false)
    expect(usePush().error.value).toBe('')
  })

  it('completes login and logout without waiting for a missing service worker', async () => {
    getRegistration.mockResolvedValue(undefined)
    const auth = useAuthStore()
    await auth.login('A@test.local', 'secret', false)
    await auth.logout()
    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(remove).not.toHaveBeenCalled()
    expect(requestPermission).not.toHaveBeenCalled()
  })
})
