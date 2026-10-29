import type { operations } from '~~/types/api'
import type Echo from 'laravel-echo'
import { apiErrorMessage } from '~/utils/apiError'

type NotificationPage = operations['notificationCenter.index']['responses'][200]['content']['application/json']
export type AppNotification = NotificationPage['data'][number]
type ReadResponse = operations['notificationCenter.read']['responses'][200]['content']['application/json']

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const unreadCount = ref(0)
  const nextCursor = ref<string | null>(null)
  const loaded = ref(false)
  const loading = ref(false)
  const marking = ref(false)
  const error = ref('')
  let account: string | undefined
  let echo: Echo<'reverb'> | undefined
  let generation = 0
  let requestVersion = 0
  let liveVersion = 0
  let readVersion = 0
  let readSettled: Promise<void> | undefined
  let settlePendingRead: (() => void) | undefined
  let subscribing: Promise<void> | undefined

  async function fetch(reset = false) {
    const version = ++requestVersion
    const session = generation
    const live = liveVersion
    const read = readVersion
    loading.value = true
    error.value = ''
    try {
      const api = useApi()
      const response = await api.get<NotificationPage>('/notifications', !reset && nextCursor.value ? { cursor: nextCursor.value } : undefined)
      if (session !== generation || version !== requestVersion) return
      // A snapshot made before/during a read is not authoritative. Keep the
      // optimistic state, then retry this same page after success or rollback.
      if (read !== readVersion || marking.value) {
        await readSettled
        if (session !== generation || version !== requestVersion) return
        return await fetch(reset)
      }
      // Broadcasts that arrive while the server snapshot is in flight must
      // not disappear or leave a stale count. Fetch a fresh snapshot once.
      if (live !== liveVersion) return await fetch(true)
      const incoming = response.data.filter(n => n.category !== 'chat')
      const unique = new Map((reset ? [] : items.value).map(n => [n.id, n]))
      incoming.forEach(n => unique.set(n.id, n))
      items.value = [...unique.values()]
      unreadCount.value = response.meta.unread_count
      nextCursor.value = response.next_cursor
      loaded.value = true
    } catch (failure) {
      if (session === generation && version === requestVersion) {
        error.value = apiErrorMessage(failure, 'Не удалось загрузить уведомления. Попробуйте ещё раз.')
      }
    } finally {
      if (session === generation && version === requestVersion) loading.value = false
    }
  }

  async function read(body: { ids: string[] } | { all: true }) {
    if (marking.value) return
    const session = generation
    const live = liveVersion
    const previousCount = unreadCount.value
    const changed = new Set(items.value.filter(n => !n.read_at && ('all' in body || body.ids.includes(n.id))).map(n => n.id))
    const now = new Date().toISOString()
    items.value = items.value.map(n => changed.has(n.id) ? { ...n, read_at: now } : n)
    unreadCount.value = 'all' in body ? 0 : Math.max(0, unreadCount.value - changed.size)
    marking.value = true
    readVersion++
    let release!: () => void
    readSettled = new Promise<void>((resolve) => { release = resolve })
    settlePendingRead = release
    let finished = false
    function finishRead() {
      if (finished) return
      finished = true
      if (session === generation) {
        readVersion++
        marking.value = false
        readSettled = undefined
        settlePendingRead = undefined
      }
      release()
    }
    try {
      const api = useApi()
      const response = await api.post<ReadResponse>('/notifications/read', body)
      if (session !== generation) return
      unreadCount.value = response.unread_count
      // Release snapshot waiters before a broadcast-triggered refresh; that
      // refresh must not wait on the mutation that is itself awaiting it.
      finishRead()
      if (live !== liveVersion) await fetch(true)
    } catch (failure) {
      if (session === generation) {
        items.value = items.value.map(n => changed.has(n.id) ? { ...n, read_at: null } : n)
        unreadCount.value = previousCount + (liveVersion - live)
      }
      throw failure
    } finally {
      finishRead()
    }
  }

  function push(notification: AppNotification) {
    if (notification.category === 'chat' || items.value.some(n => n.id === notification.id)) return
    items.value.unshift(notification)
    if (!notification.read_at) { unreadCount.value++; liveVersion++ }
  }

  function unsubscribe() {
    generation++
    requestVersion++
    if (account && echo) echo.leave(`user.${account}`)
    account = undefined
    echo = undefined
    subscribing = undefined
    items.value = []
    unreadCount.value = 0
    nextCursor.value = null
    loaded.value = false
    loading.value = false
    marking.value = false
    settlePendingRead?.()
    settlePendingRead = undefined
    readSettled = undefined
    error.value = ''
    liveVersion = 0
  }

  function subscribe(userId: string): Promise<void> {
    if (account === userId) return subscribing ?? Promise.resolve()
    unsubscribe()
    account = userId
    const session = generation
    subscribing = (async () => {
      try {
        await useSettingsStore().fetch()
        if (session !== generation) return
        echo = useEcho()
        const channel = echo.private(`user.${userId}`)
        channel.notification((notification: AppNotification) => {
          if (session === generation) push(notification)
        })
        let connected = false
        channel.subscribed(async () => {
          if (session !== generation) return
          const reconnect = connected
          connected = true
          await fetch(true)
          if (reconnect && session === generation) await useAuthStore().fetchMe()
        })
        await fetch(true)
      } catch (failure) {
        if (session === generation) {
          account = undefined // A later auth refresh may retry setup.
          error.value = apiErrorMessage(failure, 'Не удалось подключить уведомления. Попробуйте ещё раз.')
        }
      } finally {
        if (session === generation) subscribing = undefined
      }
    })()
    return subscribing
  }

  return { items, unreadCount, nextCursor, loaded, loading, marking, error, fetch, markRead: (ids: string[]) => read({ ids }), markAllRead: () => read({ all: true }), subscribe, unsubscribe, push }
})
