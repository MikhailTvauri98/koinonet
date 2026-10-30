<script setup lang="ts">
import type { components } from '~~/types/api'
import type { ChatMessage } from '~/composables/useChatMessages'
import { compareMessages, useChatMessages } from '~/composables/useChatMessages'
import { acquireChatChannel } from '~/utils/chatChannel'
import { apiErrorMessage, apiErrorStatus } from '~/utils/apiError'
import ChatHeader from './ChatHeader.vue'
import MessageList from './MessageList.vue'
import Composer from './Composer.vue'
import PinnedBar from './PinnedBar.vue'

const props = defineProps<{ chatId: string }>()
type Chat = components['schemas']['ChatResource']
const api = useApi()
const auth = useAuthStore()
const chats = useChatsStore()
const chat = shallowRef<Chat | null>(null)
const history = shallowRef<ReturnType<typeof useChatMessages>>()
const messages = computed(() => history.value?.messages.value ?? [])
const member = computed(() => !!chat.value?.members.some(m => m.user_id === auth.user?.id))
const writable = computed(() => member.value && !!chat.value?.can_write && !chat.value.archived)
const moderate = computed(() => !!chat.value?.can_moderate && !chat.value.archived)
const busy = ref(false)
const loading = ref(true)
const error = ref('')
const unavailable = ref(false)
const reply = shallowRef<ChatMessage | null>(null)
const editing = shallowRef<ChatMessage | null>(null)
const deleting = shallowRef<ChatMessage | null>(null)
const composer = ref<InstanceType<typeof Composer>>()
const deletedIds = new Set<string>()
const pins = computed(() => chat.value?.pinned_messages.filter(m => !deletedIds.has(m.id) && !m.deleted && !messages.value.some(loaded => loaded.id === m.id && loaded.deleted)) ?? [])
let lifetime = 0
let metadataRequest = 0
let detach: (() => void) | undefined
let initialized = false
let visibleId: string | undefined
let readAt = 0
let readBoundary: ChatMessage | undefined
let reading = false
let readTimer: ReturnType<typeof setTimeout> | undefined
const current = (token: number) => token === lifetime && !unavailable.value

function invalidate() {
  lifetime++; metadataRequest++; initialized = false
  detach?.(); detach = undefined; history.value?.dispose()
  chat.value = null; reply.value = null; editing.value = null; deleting.value = null
  deletedIds.clear(); visibleId = undefined; readBoundary = undefined; readAt = 0; reading = false
  if (readTimer) clearTimeout(readTimer)
  readTimer = undefined; busy.value = false; loading.value = false
}
function forbidden() { invalidate(); unavailable.value = true; error.value = 'Чат недоступен.' }
function fail(failure: unknown, token: number) {
  if (!current(token)) return
  if (apiErrorStatus(failure) === 403) forbidden()
  else error.value = apiErrorMessage(failure, 'Не удалось выполнить действие. Проверьте связь и повторите.')
}
async function refresh() {
  const token = lifetime; const request = ++metadataRequest; const id = props.chatId
  try {
    const result = await api.get<{ data: Chat }>(`/chats/${id}`)
    if (current(token) && request === metadataRequest && result.data.id === id) { chat.value = result.data; tryRead() }
  } catch (failure) { if (request === metadataRequest) fail(failure, token) }
}
async function start(preserveDraft = false) {
  const previous = preserveDraft ? { chat: chat.value, reply: reply.value, editing: editing.value } : null
  invalidate(); unavailable.value = false; error.value = ''; loading.value = true
  // Restore synchronously before Vue renders. A retry renews network lifetimes
  // without unmounting the composer and its selected-file previews.
  if (previous) { chat.value = previous.chat; reply.value = previous.reply; editing.value = previous.editing }
  const token = lifetime; const id = props.chatId
  const nextHistory = useChatMessages(id, () => { if (current(token)) forbidden() })
  history.value = nextHistory
  let subscriptionObserved = false
  try {
    const lease = acquireChatChannel(useEcho(), id)
    const handlers: [string, (payload: never) => void][] = []
    function listen<T>(name: string, callback: (payload: T) => void) {
      const guarded = (payload: T) => { if (current(token)) callback(payload) }
      lease.channel.listen(name, guarded)
      handlers.push([name, guarded as (payload: never) => void])
    }
    listen<{ message_id: string }>('.message.sent', p => { void nextHistory.hydrate(p.message_id).catch(e => fail(e, token)) })
    listen<{ message_id: string }>('.message.edited', p => { void nextHistory.hydrate(p.message_id).catch(e => fail(e, token)) })
    listen<{ message_id: string }>('.message.deleted', p => {
      deletedIds.add(p.message_id); nextHistory.applyDeleted(p.message_id)
      if (reply.value?.id === p.message_id) reply.value = messages.value.find(m => m.id === p.message_id) ?? null
      if (editing.value?.id === p.message_id) editing.value = null
      if (chat.value) chat.value = { ...chat.value, pinned_messages: chat.value.pinned_messages.filter(m => m.id !== p.message_id) }
    })
    listen('.chat.pinned', () => { void refresh() })
    listen('.chat.members_changed', () => { void refresh() })
    listen('.pusher:subscription_succeeded', () => {
      subscriptionObserved = true
      if (!initialized) return
      // Capture the gap anchor synchronously, before any metadata/list fetch.
      void nextHistory.catchUp().catch(e => fail(e, token))
      void refresh(); void chats.fetch()
    })
    listen<{ status?: number }>('.pusher:subscription_error', p => { fail({ status: p.status }, token) })
    detach = () => { handlers.forEach(([event, callback]) => lease.channel.stopListening(event, callback)); lease.release() }
  } catch (failure) { fail(failure, token) }
  await Promise.all([refresh(), nextHistory.loadInitial().catch(e => fail(e, token))])
  if (current(token)) {
    initialized = true; loading.value = false; tryRead()
    if (subscriptionObserved) void nextHistory.catchUp().catch(e => fail(e, token))
  }
}
async function run(action: () => Promise<void>) {
  if (busy.value || unavailable.value) return
  const token = lifetime; busy.value = true; error.value = ''
  try { await action() } catch (failure) { fail(failure, token) }
  finally { if (current(token)) busy.value = false }
}
async function retry() {
  if (busy.value || loading.value || unavailable.value) return
  const token = lifetime; const session = auth.sessionVersion; const id = props.chatId
  busy.value = true
  try {
    // Settings and the personal channel belong to auth/notifications. Let
    // their existing retry path repair setup before renewing our chat lease.
    await auth.refreshRealtime()
    if (current(token) && session === auth.sessionVersion && id === props.chatId) await start(true)
  } catch (failure) { fail(failure, token) }
  finally { if (current(token)) busy.value = false }
}
function send(payload: { body: string, media_ids: string[], reply_to_id: string | null }) {
  if (!writable.value || loading.value) return
  const token = lifetime; const selected = editing.value
  void run(async () => {
    const result = selected
      ? await api.patch<{ data: ChatMessage }>(`/messages/${selected.id}`, { body: payload.body })
      : await api.post<{ data: ChatMessage }>(`/chats/${props.chatId}/messages`, payload)
    if (!current(token)) return
    history.value?.applySent(result.data); composer.value?.clear(); reply.value = null; editing.value = null
    void chats.fetch()
  })
}
function remove() {
  const selected = deleting.value; const token = lifetime
  if (!selected) return
  void run(async () => {
    await api.delete(`/messages/${selected.id}`)
    if (!current(token)) return
    deletedIds.add(selected.id); history.value?.applyDeleted(selected.id); deleting.value = null
    if (reply.value?.id === selected.id) reply.value = messages.value.find(m => m.id === selected.id) ?? null
    if (editing.value?.id === selected.id) editing.value = null
    if (chat.value) chat.value = { ...chat.value, pinned_messages: chat.value.pinned_messages.filter(m => m.id !== selected.id) }
  })
}
function pin(message: ChatMessage) {
  if (!moderate.value) return
  const token = lifetime; const pinned = pins.value.some(m => m.id === message.id)
  void run(async () => {
    const result = await (pinned ? api.delete : api.post)<{ data: ChatMessage[] }>(`/messages/${message.id}/pin`)
    if (current(token) && chat.value) chat.value = { ...chat.value, pinned_messages: result.data }
  })
}
function mute() {
  if (!member.value || !chat.value) return
  const token = lifetime; const muted = !!chat.value.muted_until && new Date(chat.value.muted_until).getTime() > Date.now()
  void run(async () => {
    const result = await (muted ? api.delete : api.post)<{ data: Chat }>(`/chats/${props.chatId}/mute`)
    if (current(token)) { metadataRequest++; chat.value = result.data; void chats.fetch() }
  })
}
function visibility(id: string, visible: boolean) {
  if (visible) visibleId = id
  else if (visibleId === id) visibleId = undefined
  tryRead()
}
function tryRead() {
  const latest = messages.value.at(-1)
  if (!initialized || !member.value || !latest || latest.id !== visibleId || document.visibilityState !== 'visible' || reading || unavailable.value) return
  if (readBoundary && compareMessages(latest, readBoundary) <= 0) return
  const delay = 1000 - (Date.now() - readAt)
  if (delay > 0) { if (!readTimer) readTimer = setTimeout(() => { readTimer = undefined; tryRead() }, delay); return }
  const token = lifetime; reading = true; readAt = Date.now()
  void api.post(`/chats/${props.chatId}/read`, { message_id: latest.id }).then(() => {
    if (!current(token)) return
    readBoundary = latest
    // The POST snapshot may predate a personal unread event received while it
    // was in flight. Refresh through the store's revision-protected snapshot.
    void chats.fetch()
  }).catch(failure => fail(failure, token)).finally(() => { if (current(token)) { reading = false; if (messages.value.at(-1)?.id !== latest.id) tryRead() } })
}
watch(() => chats.chats.find(c => c.id === props.chatId), card => {
  if (!card || !chat.value || unavailable.value) return
  chat.value = { ...chat.value, title: card.title, avatar_url: card.avatar_url, archived: card.archived, muted_until: card.muted_until }
  void refresh()
}, { flush: 'sync' })
watch(() => chats.lastChange, change => {
  // Removal invalidates personalized data immediately, but ministries.view_all
  // may still permit a read-only view. Only a current authorization refusal
  // makes the screen unavailable; never replay old pending requests.
  if (change?.id === props.chatId && change.removed) void start()
}, { flush: 'sync' })
watch([() => auth.sessionVersion, () => auth.user?.id], () => { forbidden() }, { flush: 'sync' })
watch(() => props.chatId, () => { void start() })
watch(messages, () => {
  if (reply.value) reply.value = messages.value.find(m => m.id === reply.value?.id) ?? reply.value
  if (editing.value && messages.value.some(m => m.id === editing.value?.id && m.deleted)) editing.value = null
  tryRead()
})
onMounted(() => { document.addEventListener('visibilitychange', tryRead); void start() })
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', tryRead); invalidate() })
defineExpose({ refresh })
</script>

<template>
  <section class="chat-screen" aria-label="Чат">
    <p v-if="loading" role="status">Загрузка чата…</p>
    <p v-if="error" role="alert">{{ error }} <button v-if="!unavailable" type="button" :disabled="busy || loading" @click="retry">Повторить</button></p>
    <template v-if="chat">
      <ChatHeader :chat="chat" :member="member" :busy="busy" @mute="mute"><template #menu><slot name="menu" :chat="chat" :refresh="refresh" /></template></ChatHeader>
      <PinnedBar :messages="pins" :moderate="moderate" @unpin="pin" />
      <MessageList :messages="messages" :has-older="history?.hasOlder.value ?? false" :loading-older="history?.loadingOlder.value ?? false" :user-id="auth.user?.id" :writable="writable" :moderate="moderate" :pinned-ids="pins.map(m => m.id)" @older="history?.loadOlder().catch(e => fail(e, lifetime))" @visible="visibility" @reply="reply = $event; editing = null" @edit="editing = $event; reply = null" @delete="deleting = $event" @pin="pin" />
      <div v-if="deleting" role="alertdialog" aria-label="Удалить сообщение?" class="confirm">
        <p>Удалить сообщение?</p><button type="button" :disabled="busy" @click="remove">Удалить</button> <button type="button" :disabled="busy" @click="deleting = null">Отмена</button>
      </div>
      <Composer v-if="writable" ref="composer" :busy="busy || loading" :reply="reply" :editing="editing" @send="send" @cancel="reply = null; editing = null" />
      <p v-else role="status">{{ chat.archived ? 'Чат архивирован' : 'Чат доступен только для чтения' }}</p>
    </template>
  </section>
</template>
<style scoped>
.chat-screen { display: flex; flex-direction: column; height: calc(100dvh - 140px); min-height: 360px; max-width: 900px; margin: auto; }
[role='alert'] { color: #a32020; }
.confirm { padding: .8rem; background: #fff2df; }
</style>
