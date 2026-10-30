import type { components, operations } from '~~/types/api'
import type { Channel } from 'laravel-echo'
import { apiErrorMessage } from '~/utils/apiError'

export type ChatListItem = components['schemas']['ChatListItemResource']
type ChatPage = operations['chat.index']['responses'][200]['content']['application/json']
type ChatUpdate = { chat: ChatListItem, removed?: false } | { chat: { id: string }, removed: true }

// API timestamps are UTC; pad fractions rather than truncating them to Date's
// milliseconds. This preserves the server's timestamp + id ordering.
function timestamp(value: string) {
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`)
}
function newestFirst(a: ChatListItem, b: ChatListItem) {
  if (a.last_message_at !== b.last_message_at) {
    if (!a.last_message_at) return 1
    if (!b.last_message_at) return -1
    const first = timestamp(a.last_message_at)
    const second = timestamp(b.last_message_at)
    if (first !== second) return first < second ? 1 : -1
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export const useChatsStore = defineStore('chats', () => {
  const chats = ref<ChatListItem[]>([])
  const unreadTotal = ref(0)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const connectionError = ref('')
  let account: string | undefined
  let channel: Channel | undefined
  let generation = 0
  let requestVersion = 0
  let liveVersion = 0
  let totalVersion = 0
  const changes = new Map<string, { version: number, chat: ChatListItem | null }>()
  let detach: (() => void) | undefined

  function upsert(chat: ChatListItem) {
    changes.set(chat.id, { version: ++liveVersion, chat })
    chats.value = [...chats.value.filter(c => c.id !== chat.id), chat].sort(newestFirst)
  }
  function remove(chatId: string) {
    changes.set(chatId, { version: ++liveVersion, chat: null })
    chats.value = chats.value.filter(c => c.id !== chatId)
  }
  function setUnreadTotal(total: number) {
    totalVersion++
    unreadTotal.value = total
  }
  async function fetch() {
    const session = generation
    const request = ++requestVersion
    const live = liveVersion
    const total = totalVersion
    loading.value = true
    error.value = ''
    try {
      const response = await useApi().get<ChatPage>('/chats')
      if (session !== generation || request !== requestVersion) return
      const snapshot = new Map(response.data.map(chat => [chat.id, chat]))
      // Replay only changes received after this request began, including
      // tombstones, so an older HTTP snapshot cannot resurrect excluded chats.
      changes.forEach((change, id) => {
        if (change.version <= live) return
        if (change.chat) snapshot.set(id, change.chat)
        else snapshot.delete(id)
      })
      chats.value = [...snapshot.values()].sort(newestFirst)
      if (total === totalVersion) unreadTotal.value = response.meta.unread_total
      loaded.value = true
      changes.forEach((change, id) => { if (change.version <= live) changes.delete(id) })
    } catch (failure) {
      if (session === generation && request === requestVersion) {
        error.value = apiErrorMessage(failure, 'Не удалось загрузить чаты. Попробуйте ещё раз.')
      }
    } finally {
      if (session === generation && request === requestVersion) loading.value = false
    }
  }
  function unsubscribeUser() {
    generation++
    requestVersion++
    detach?.()
    detach = undefined
    account = undefined
    channel = undefined
    chats.value = []
    unreadTotal.value = 0
    loading.value = false
    loaded.value = false
    error.value = ''
    changes.clear()
    connectionError.value = ''
    liveVersion = 0
    totalVersion = 0
  }
  async function subscribeUser(userId: string) {
    // auth calls this only after notifications has initialized settings and
    // acquired the shared channel. Notifications alone owns echo.leave().
    let next: Channel
    try {
      next = useEcho().private(`user.${userId}`)
    } catch (failure) {
      connectionError.value = apiErrorMessage(failure, 'Не удалось подключить чаты. Попробуйте ещё раз.')
      return
    }
    if (account === userId && channel === next) {
      connectionError.value = ''
      return
    }
    unsubscribeUser()
    account = userId
    channel = next
    const session = generation
    const update = (payload: ChatUpdate) => {
      if (session !== generation) return
      if (payload.removed) remove(payload.chat.id)
      else upsert(payload.chat)
    }
    const total = (payload: { total: number }) => { if (session === generation) setUnreadTotal(payload.total) }
    const connected = () => { if (session === generation) void fetch() }
    next.listen('.chat.updated', update)
    next.listen('.unread.total', total)
    // Echo.subscribed wraps its callback, preventing selective removal. The
    // raw event keeps our reconnect listener removable without touching others.
    next.listen('.pusher:subscription_succeeded', connected)
    detach = () => {
      next.stopListening('.chat.updated', update)
      next.stopListening('.unread.total', total)
      next.stopListening('.pusher:subscription_succeeded', connected)
    }
    await fetch()
  }
  async function retry() {
    const auth = useAuthStore()
    const session = auth.sessionVersion
    await auth.refreshRealtime()
    if (session === auth.sessionVersion) await fetch()
  }
  return { chats, unreadTotal, loading, loaded, error, connectionError, fetch, retry, upsert, remove, setUnreadTotal, subscribeUser, unsubscribeUser }
})
