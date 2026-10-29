import { getCurrentInstance, onMounted, ref } from 'vue'
import { apiErrorStatus } from '~/utils/apiError'

export function urlBase64ToUint8Array(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(decoded, character => character.charCodeAt(0))
}

export function subscriptionPayload(subscription: PushSubscriptionJSON) {
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys.auth) {
    throw new Error('Incomplete push subscription')
  }
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    content_encoding: 'aes128gcm',
  }
}

// ready может никогда не разрешиться без активной регистрации (dev, e2e).
// Отписка вызывается также из auth store, без setup()/onMounted().
async function existingRegistration() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistration) return undefined
  return navigator.serviceWorker.getRegistration('/')
}

export function usePush() {
  const api = useApi()
  const settings = useSettingsStore()
  const supported = typeof Notification !== 'undefined' && typeof PushManager !== 'undefined'
    && typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.getRegistration)
  const permission = ref<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported')
  const subscribed = ref(false)

  if (getCurrentInstance()) {
    onMounted(async () => {
      try {
        const registration = await existingRegistration()
        subscribed.value = Boolean(await registration?.pushManager?.getSubscription())
      } catch {
        // Недоступность SW не мешает открыть центр и настройки уведомлений.
        subscribed.value = false
      }
    })
  }

  async function subscribe() {
    const platform = usePlatform()
    if (!supported || (platform.isIos && !platform.isStandalone)) return
    // До первого await: системный запрос остаётся в явном жесте человека.
    permission.value = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission
    if (permission.value !== 'granted') return

    await settings.fetch()
    if (!settings.vapidPublicKey) throw new Error('Push is not configured')
    const registration = await existingRegistration()
    if (!registration?.active || !registration.pushManager) throw new Error('No active service worker')
    const existing = await registration.pushManager.getSubscription()
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
    })
    try {
      await api.post('/push-subscriptions', subscriptionPayload(subscription.toJSON()))
      subscribed.value = true
    } catch (error) {
      if (!existing) await subscription.unsubscribe()
      subscribed.value = false
      throw error
    }
  }

  async function unsubscribe() {
    const registration = await existingRegistration()
    const subscription = await registration?.pushManager?.getSubscription()
    if (!subscription) {
      subscribed.value = false
      return
    }
    try {
      await api.delete('/push-subscriptions', { endpoint: subscription.endpoint })
    } catch (error) {
      // 401 уже завершил сессию; браузер всё равно нужно отписать.
      if (apiErrorStatus(error) !== 401) throw error
    }
    await subscription.unsubscribe()
    subscribed.value = false
  }

  return { supported, permission, subscribed, subscribe, unsubscribe }
}
