// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscriptionPayload, urlBase64ToUint8Array, usePush } from '~/composables/usePush'

const { post, remove, fetchSettings, settings } = vi.hoisted(() => ({
  post: vi.fn(), remove: vi.fn(), fetchSettings: vi.fn(), settings: { vapidPublicKey: 'BAEC_-8' },
}))
mockNuxtImport('useApi', () => () => ({ post, delete: remove }))
mockNuxtImport('useSettingsStore', () => () => ({ ...settings, fetch: fetchSettings }))

const requestPermission = vi.fn()
const browserUnsubscribe = vi.fn()
const browserSubscribe = vi.fn()
const getSubscription = vi.fn()
const getRegistration = vi.fn()
const json = { endpoint: 'https://push.example/device', expirationTime: null, keys: { p256dh: 'P', auth: 'A' } }
const subscription = { endpoint: json.endpoint, toJSON: () => json, unsubscribe: browserUnsubscribe }
const registration = { active: {}, pushManager: { subscribe: browserSubscribe, getSubscription } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('Notification', { permission: 'default', requestPermission })
  vi.stubGlobal('PushManager', vi.fn())
  vi.stubGlobal('navigator', { userAgent: 'Chrome Android', serviceWorker: { getRegistration, ready: new Promise(() => {}) } })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  getRegistration.mockResolvedValue(registration)
  getSubscription.mockResolvedValue(null)
  browserSubscribe.mockResolvedValue(subscription)
  browserUnsubscribe.mockResolvedValue(true)
  requestPermission.mockResolvedValue('granted')
  settings.vapidPublicKey = 'BAEC_-8'
})
afterEach(() => vi.unstubAllGlobals())

describe('push helpers', () => {
  it('decodes a URL-safe VAPID key', () => {
    expect(Array.from(urlBase64ToUint8Array('BAEC_-8'))).toEqual([4, 1, 2, 255, 239])
  })
  it('sends browser endpoint and keys with the supported encoding', () => {
    expect(subscriptionPayload(json)).toEqual({ endpoint: json.endpoint, keys: json.keys, content_encoding: 'aes128gcm' })
  })
  it('rejects a subscription without browser keys', () => {
    expect(() => subscriptionPayload({ endpoint: json.endpoint })).toThrow()
  })
})

describe('push subscription lifecycle', () => {
  it('reads the existing subscription on mount without asking permission or posting', async () => {
    getSubscription.mockResolvedValue(subscription)
    let push!: ReturnType<typeof usePush>
    const wrapper = await mountSuspended(defineComponent({ setup() { push = usePush(); return () => null } }))
    await vi.waitFor(() => expect(push.subscribed.value).toBe(true))
    expect(requestPermission).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('asks permission on subscribe and persists the browser subscription before declaring success', async () => {
    const push = usePush()
    await push.subscribe()
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(browserSubscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey) })
    expect(post).toHaveBeenCalledWith('/push-subscriptions', subscriptionPayload(json))
    expect(push.permission.value).toBe('granted')
    expect(push.subscribed.value).toBe(true)
  })
  it('does not create a subscription after permission is denied', async () => {
    requestPermission.mockResolvedValue('denied')
    const push = usePush()
    await push.subscribe()
    expect(push.permission.value).toBe('denied')
    expect(browserSubscribe).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
  it('never asks permission on iOS outside the installed app', async () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone Safari', serviceWorker: { getRegistration } })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    await usePush().subscribe()
    expect(requestPermission).not.toHaveBeenCalled()
  })
  it('reuses an existing subscription and saves it for the current account', async () => {
    getSubscription.mockResolvedValue(subscription)
    await usePush().subscribe()
    expect(browserSubscribe).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledWith('/push-subscriptions', subscriptionPayload(json))
  })
  it('rolls back a newly created browser subscription when persistence fails', async () => {
    post.mockRejectedValue(new Error('offline'))
    const push = usePush()
    await expect(push.subscribe()).rejects.toThrow('offline')
    expect(browserUnsubscribe).toHaveBeenCalledOnce()
    expect(push.subscribed.value).toBe(false)
  })
  it('deletes only this endpoint before unsubscribing, without a component mount', async () => {
    getSubscription.mockResolvedValue(subscription)
    remove.mockImplementation(async () => { expect(browserUnsubscribe).not.toHaveBeenCalled() })
    const push = usePush()
    await push.unsubscribe()
    expect(remove).toHaveBeenCalledWith('/push-subscriptions', { endpoint: json.endpoint })
    expect(browserUnsubscribe).toHaveBeenCalledOnce()
    expect(push.subscribed.value).toBe(false)
  })
  it('preserves the browser subscription when the server cannot delete it', async () => {
    getSubscription.mockResolvedValue(subscription)
    remove.mockRejectedValue(new Error('offline'))
    await expect(usePush().unsubscribe()).rejects.toThrow('offline')
    expect(browserUnsubscribe).not.toHaveBeenCalled()
  })
  it('cleans the browser subscription if the session is already expired', async () => {
    getSubscription.mockResolvedValue(subscription)
    remove.mockRejectedValue({ statusCode: 401 })
    await usePush().unsubscribe()
    expect(browserUnsubscribe).toHaveBeenCalledOnce()
  })
  it('does not wait for serviceWorker.ready when no registration exists', async () => {
    getRegistration.mockResolvedValue(undefined)
    await usePush().unsubscribe()
    expect(remove).not.toHaveBeenCalled()
    expect(requestPermission).not.toHaveBeenCalled()
  })
  it('explains a missing service worker on explicit subscribe without waiting for ready', async () => {
    getRegistration.mockResolvedValue(undefined)
    await expect(usePush().subscribe()).rejects.toThrow('No active service worker')
    expect(browserSubscribe).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
  it('retains an existing browser subscription on a failed registration update', async () => {
    getSubscription.mockResolvedValue(subscription)
    post.mockRejectedValue(new Error('offline'))
    await expect(usePush().subscribe()).rejects.toThrow('offline')
    expect(browserUnsubscribe).not.toHaveBeenCalled()
  })
  it('handles a browser without service workers or notification support', async () => {
    vi.stubGlobal('navigator', { userAgent: 'old browser' })
    vi.stubGlobal('Notification', undefined)
    const push = usePush()
    expect(push.supported).toBe(false)
    expect(push.permission.value).toBe('unsupported')
    await push.unsubscribe()
    expect(remove).not.toHaveBeenCalled()
  })
})
