import { storeToRefs } from 'pinia'
import { usePushStore } from '~/stores/push'

export function usePush() {
  const state = usePushStore()
  const { subscribed, error } = storeToRefs(state)
  const supported = typeof Notification !== 'undefined' && typeof PushManager !== 'undefined'
    && typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.getRegistration)
  const permission = ref<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported')

  async function subscribe() {
    const platform = usePlatform()
    if (!supported || (platform.isIos && !platform.isStandalone)) return
    // Permission is requested only by an explicit button gesture.
    const result = Notification.permission === 'default'
      ? Notification.requestPermission()
      : Promise.resolve(Notification.permission)
    await state.subscribe(result.then(value => {
      permission.value = value
      return value === 'granted'
    }))
  }

  return { supported, permission, subscribed, error, subscribe,
    unsubscribe: state.unsubscribe, setAccount: state.setAccount, retry: state.retry }
}
