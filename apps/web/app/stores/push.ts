import { apiErrorCode, apiErrorStatus } from '~/utils/apiError'
import { subscriptionPayload, urlBase64ToUint8Array } from '~/utils/pushSubscription'

// ready never resolves without a worker (including dev and E2E).
async function existingRegistration() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistration) return undefined
  return navigator.serviceWorker.getRegistration('/')
}

export const usePushStore = defineStore('push', () => {
  const subscribed = ref(false)
  const error = ref('')
  let accountId: string | null = null
  let generation = 0
  let pending: Promise<unknown> = Promise.resolve()

  // Only one endpoint mutation at a time. Rejections never poison later work.
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation)
    pending = result.catch(() => {})
    return result
  }

  function current(version: number) { return version === generation && accountId !== null }

  async function invalidate(subscription?: PushSubscription | null) {
    try {
      const existing = subscription ?? await (await existingRegistration())?.pushManager?.getSubscription()
      if (!existing) return
      // false means no subscription existed; rejection is the actual failure.
      await existing.unsubscribe()
    } catch (failure) {
      reportFailure()
      throw failure
    }
  }

  function reportFailure() {
    error.value = 'Не удалось проверить или отключить пуши этого устройства. Возможны уведомления прежнего аккаунта. Повторите проверку; если ошибка сохраняется, запретите уведомления для приложения в настройках браузера.'
  }

  async function bind(subscription: PushSubscription, version: number) {
    try {
      await useApi().post('/push-subscriptions', subscriptionPayload(subscription.toJSON()))
      if (!current(version)) {
        await invalidate(subscription)
        return
      }
      subscribed.value = true
      error.value = ''
    } catch (failure) {
      // A failed or late request may already have committed server-side. The
      // endpoint must stop receiving, even when it was present before login.
      try { await invalidate(subscription) }
      catch { reportFailure() }
      if (current(version)) subscribed.value = false
      throw failure
    }
  }

  async function reconcile(version: number) {
    if (!current(version)) return
    let subscription: PushSubscription | null | undefined
    try { subscription = await (await existingRegistration())?.pushManager?.getSubscription() }
    catch (failure) { reportFailure(); throw failure }
    if (!current(version)) return
    if (subscription) await bind(subscription, version)
    else error.value = ''
  }

  function setAccount(id: string | null): Promise<void> {
    if (id !== null && id === accountId) return Promise.resolve()
    const previous = accountId
    accountId = id
    const version = ++generation
    subscribed.value = false
    // Start browser teardown immediately, including reset from useApi's 401
    // handler. Never await the serialized operation from inside that handler.
    const cleanup = previous !== null || id === null
      ? invalidate().then(() => { if (version === generation) error.value = '' }).catch(() => { reportFailure() })
      : Promise.resolve()
    return serialize(async () => {
      await cleanup
      if (!current(version)) return
      try { await reconcile(version) }
      catch {
        // Safe invalidation leaves the enable button available. A double
        // failure remains visible globally; push failure must not block login.
      }
    })
  }

  function retry(): Promise<void> {
    const version = generation
    return serialize(async () => {
      if (accountId === null) {
        try { await invalidate(); error.value = '' }
        catch { reportFailure() }
        return
      }
      try { await reconcile(version) }
      catch { /* bind exposes an unsafe teardown failure through shared error */ }
    })
  }

  async function subscribe(permissionGranted: Promise<boolean>): Promise<void> {
    const version = generation
    // A dismissed/open permission prompt must not hold up logout or reset.
    if (!await permissionGranted || !current(version)) return
    return serialize(async () => {
      if (!current(version)) return
      const settings = useSettingsStore()
      await settings.fetch()
      if (!current(version)) return
      if (!settings.vapidPublicKey) throw new Error('Push is not configured')
      const registration = await existingRegistration()
      if (!current(version)) return
      if (!registration?.active || !registration.pushManager) throw new Error('No active service worker')
      const existing = await registration.pushManager.getSubscription()
      if (!current(version)) return
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
      })
      if (!current(version)) { await invalidate(subscription); return }
      await bind(subscription, version)
    })
  }

  function unsubscribe(): Promise<void> {
    const version = generation
    return serialize(async () => {
      if (version !== generation) return
      const registration = await existingRegistration()
      if (version !== generation) return
      const subscription = await registration?.pushManager?.getSubscription()
      if (version !== generation) {
        if (subscription) await invalidate(subscription)
        return
      }
      if (subscription) {
        try {
          await useApi().delete('/push-subscriptions', { endpoint: subscription.endpoint })
        } catch (failure) {
          const absent = apiErrorStatus(failure) === 422 && apiErrorCode(failure) === 'push.subscription_not_found'
          if (apiErrorStatus(failure) !== 401 && !absent) throw failure
        }
        await invalidate(subscription)
      }
      if (version !== generation) return
      subscribed.value = false
      error.value = ''
    })
  }

  return { subscribed, error, setAccount, retry, subscribe, unsubscribe }
})
