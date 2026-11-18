// Одно состояние связи для всего приложения. Берёт ошибки подключения у
// chats/notifications stores, события сокета Echo и online/offline браузера,
// сам повторяет подключение с нарастающей паузой и ничего не рисует.
export type RealtimeState = 'online' | 'reconnecting' | 'offline'

const DELAYS = [2000, 5000, 15000, 30000]
const DOWN = ['unavailable', 'failed', 'disconnected']

type Connection = {
  state?: string
  bind: (event: string, callback: (change: { current: string }) => void) => unknown
  unbind: (event: string, callback: (change: { current: string }) => void) => unknown
}

export const useRealtimeStore = defineStore('realtime', () => {
  const auth = useAuthStore()
  const chats = useChatsStore()
  const notifications = useNotificationsStore()

  const failures = ref(0)
  const browserOffline = ref(false)
  const socketDown = ref(false)
  const problem = computed(() => browserOffline.value || socketDown.value || !!chats.connectionError || !!notifications.connectionError)
  const state = computed<RealtimeState>(() => browserOffline.value ? 'offline' : problem.value ? 'reconnecting' : 'online')

  let consumers = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let retrying = false
  let run = 0
  let bound: Connection | undefined

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  function schedule() {
    clearTimer()
    if (!consumers || !problem.value || browserOffline.value || retrying) return
    const delay = DELAYS[Math.min(Math.max(failures.value, 1) - 1, DELAYS.length - 1)]!
    timer = setTimeout(() => { void attempt() }, delay)
  }

  function onSocket(change: { current: string }) {
    if (change.current === 'connected') socketDown.value = false
    else if (DOWN.includes(change.current)) socketDown.value = true
  }
  function unbindEcho() {
    bound?.unbind('state_change', onSocket)
    bound = undefined
  }
  function bindEcho() {
    let connection: Connection | undefined
    try {
      connection = (useEcho() as unknown as { connector?: { pusher?: { connection?: Connection } } }).connector?.pusher?.connection
    } catch { /* settings are not loaded yet; bound on the next attempt */ }
    if (!connection || typeof connection.bind !== 'function' || connection === bound) return
    unbindEcho()
    connection.bind('state_change', onSocket)
    bound = connection
    socketDown.value = DOWN.includes(connection.state ?? '')
  }

  async function attempt() {
    if (retrying || !consumers) return
    clearTimer()
    retrying = true
    if (!failures.value) failures.value = 1
    const session = auth.sessionVersion
    const id = run
    try {
      // The stores own subscription and snapshot logic; reuse their paths.
      await chats.retry()
      if (notifications.connectionError && session === auth.sessionVersion) await notifications.fetch(true)
    } catch { /* the stores report failures through connectionError */ }
    if (id !== run || session !== auth.sessionVersion) return
    retrying = false
    bindEcho()
    if (problem.value) {
      failures.value++
      schedule()
    } else {
      failures.value = 0
    }
  }

  function retry() {
    if (retrying) return
    void attempt()
  }

  function onOffline() { browserOffline.value = true; clearTimer() }
  function onOnline() {
    browserOffline.value = false
    if (problem.value) void attempt()
  }

  function reset() {
    run++
    retrying = false
    clearTimer()
    failures.value = 0
    socketDown.value = false
    bindEcho()
  }

  watch(problem, (value) => {
    if (retrying) return // the running attempt decides the outcome
    if (value) {
      if (!failures.value) failures.value = 1
      schedule()
    } else {
      clearTimer()
      failures.value = 0
    }
  })
  watch(() => auth.sessionVersion, reset)

  function attach() {
    if (consumers++) return
    browserOffline.value = typeof navigator !== 'undefined' && navigator.onLine === false
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    bindEcho()
    if (problem.value) {
      if (!failures.value) failures.value = 1
      schedule()
    }
  }
  function detach() {
    if (!consumers || --consumers) return
    run++
    retrying = false
    clearTimer()
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    unbindEcho()
  }

  return { state, failures, retry, attach, detach }
})
