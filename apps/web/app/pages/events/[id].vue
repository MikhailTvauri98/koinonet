<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import { apiErrorMessage, apiErrorStatus } from '~/utils/apiError'
import EventEditor from '~/components/calendar/EventEditor.vue'
import CancelEventDialog from '~/components/calendar/CancelEventDialog.vue'
import EventSlotManager from '~/components/calendar/EventSlotManager.vue'
import EventCard from '~/components/calendar/EventCard.vue'
import AssignDialog from '~/components/calendar/AssignDialog.vue'
const api = useApi(), route = useRoute(), auth = useAuthStore(), settings = useSettingsStore()
const item = ref<EventItem | null>(null), errorMessage = ref(''), loading = ref(false)
const action = ref<'edit' | 'cancel' | null>(null), selectedSlot = ref<EventSlot | null>(null)
const refreshError = ref(''), refreshing = ref(false)
const router = useRouter(), chatBusy = ref(false), chatError = ref('')
let generation = 0
async function load() {
  const current = ++generation, session = auth.sessionVersion
  item.value = null; action.value = null; selectedSlot.value = null; errorMessage.value = ''; refreshError.value = ''; chatError.value = ''; chatBusy.value = false; refreshing.value = false; loading.value = true
  try {
    await settings.fetch()
    if (current !== generation || session !== auth.sessionVersion) return
    const result = await api.get<{ data: EventItem }>(`/events/${encodeURIComponent(String(route.params.id))}`)
    if (current === generation && session === auth.sessionVersion) item.value = result.data
  } catch (error) {
    if (current === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить событие. Попробуйте ещё раз.')
  } finally { if (current === generation && session === auth.sessionVersion) loading.value = false }
}
// Preserve the dialog during refresh: its warnings describe an assignment
// that has already succeeded, even though the event receives a new roster.
async function refreshAssignments() {
  if (!item.value) return
  const current = ++generation, session = auth.sessionVersion, eventId = item.value.id
  refreshing.value = true; refreshError.value = ''
  try {
    const result = await api.get<{ data: EventItem }>(`/events/${encodeURIComponent(eventId)}`)
    if (current !== generation || session !== auth.sessionVersion) return
    item.value = result.data
    if (selectedSlot.value) selectedSlot.value = result.data.slots.find(s => s.id === selectedSlot.value?.id) ?? null
  } catch (error) {
    if (current !== generation || session !== auth.sessionVersion) return
    const status = apiErrorStatus(error)
    if (status === 403 || status === 404) {
      item.value = null; selectedSlot.value = null; action.value = null
      refreshError.value = 'Изменение сохранено. Событие больше недоступно.'
    } else {
      refreshError.value = apiErrorMessage(error, 'Изменение сохранено, но не удалось обновить состав. Попробуйте ещё раз.')
    }
  } finally { if (current === generation && session === auth.sessionVersion) refreshing.value = false }
}
function requestAction(value: 'edit' | 'cancel') { if (item.value?.can_manage) { action.value = value; selectedSlot.value = null } }
async function createChat() {
  if (!item.value?.can_manage || chatBusy.value || item.value.chat_id) return
  const token = generation, session = auth.sessionVersion, id = item.value.id
  chatBusy.value = true; chatError.value = ''
  try {
    const result = await api.post<{ data: { id: string } }>(`/events/${encodeURIComponent(id)}/chat`, {})
    if (token === generation && session === auth.sessionVersion) await router.push(`/chats/${result.data.id}`)
  } catch (failure) { if (token === generation && session === auth.sessionVersion) chatError.value = apiErrorMessage(failure, 'Не удалось создать чат события. Попробуйте ещё раз.') }
  finally { if (token === generation && session === auth.sessionVersion) chatBusy.value = false }
}
function requestAssignment(slot: EventSlot) { if (slot.can_fill) { selectedSlot.value = slot; action.value = null } }
watch(() => route.params.id, () => { void load() })
watch(() => auth.sessionVersion, () => { generation++; item.value = null; action.value = null; selectedSlot.value = null; loading.value = false; refreshing.value = false; refreshError.value = '' })
onBeforeUnmount(() => { generation++ })
defineExpose({ load, action, selectedSlot })
await load()
</script>

<template>
  <main>
    <NuxtLink to="/calendar">Календарь</NuxtLink>
    <p v-if="loading" role="status">Загружаем событие…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" @click="load">Повторить</button></p>
    <p v-if="refreshing" role="status">Обновляем состав…</p>
    <p v-if="refreshError" role="alert">{{ refreshError }} <button v-if="item" type="button" data-test="retry-assignments" @click="refreshAssignments">Повторить</button></p>
    <EventCard v-if="item" :event="item" detail @edit="requestAction('edit')" @cancel="requestAction('cancel')" @assign="requestAssignment" @assignments-changed="refreshAssignments" />
    <NuxtLink v-if="item?.chat_id" data-test="open-chat" :to="`/chats/${item.chat_id}`">Открыть чат</NuxtLink>
    <button v-else-if="item?.can_manage" type="button" data-test="create-chat" :disabled="chatBusy" @click="createChat">Создать чат</button>
    <p v-if="chatError" role="alert">{{ chatError }}</p>
    <AssignDialog v-if="item && selectedSlot" :key="`${item.id}-${selectedSlot.id}`" v-bind="{ slot: selectedSlot }" :event-id="item.id" @assigned="refreshAssignments" @close="selectedSlot = null" />
    <EventEditor v-if="item && action === 'edit'" :event="item" @saved="load" @cancel="action = null" />
    <CancelEventDialog v-if="item && action === 'cancel'" :event-id="item.id" @saved="load" @cancel="action = null" />
    <EventSlotManager v-if="item" :event="item" @saved="load" />
  </main>
</template>
