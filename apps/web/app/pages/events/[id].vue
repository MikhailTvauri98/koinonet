<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import { apiErrorMessage, apiErrorStatus } from '~/utils/apiError'
import EventEditor from '~/components/calendar/EventEditor.vue'
import CancelEventDialog from '~/components/calendar/CancelEventDialog.vue'
import EventSlotManager from '~/components/calendar/EventSlotManager.vue'
import EventCard from '~/components/calendar/EventCard.vue'
import AssignDialog from '~/components/calendar/AssignDialog.vue'
import PageHeader from '~/components/ui/PageHeader.vue'
import { safeCalendarReturn } from '~/composables/useCalendarView'
const api = useApi(), route = useRoute(), auth = useAuthStore(), settings = useSettingsStore(), { can, canIn } = useCan()
const item = ref<EventItem | null>(null), errorMessage = ref(''), loading = ref(false)
const action = ref<'edit' | 'cancel' | null>(null), selectedSlot = ref<EventSlot | null>(null)
const slotAction = ref<{ mode: 'new' | 'edit' | 'remove', slot?: EventSlot } | null>(null)
const refreshError = ref(''), refreshing = ref(false), successMessage = ref('')
const router = useRouter(), chatBusy = ref(false), chatError = ref('')
const blocked = computed(() => refreshing.value || !!refreshError.value)
let generation = 0, alive = true, couldViewPeople = can('people.view')
async function load() {
  const current = ++generation, session = auth.sessionVersion, eventId = String(route.params.id)
  item.value = null; action.value = null; selectedSlot.value = null; slotAction.value = null; errorMessage.value = ''; refreshError.value = ''; successMessage.value = ''; chatError.value = ''; chatBusy.value = false; refreshing.value = false; loading.value = true
  try {
    await settings.fetch()
    if (!alive || current !== generation || session !== auth.sessionVersion) return
    const result = await api.get<{ data: EventItem }>(`/events/${encodeURIComponent(eventId)}`)
    if (alive && current === generation && session === auth.sessionVersion) item.value = result.data
  } catch (error) {
    if (alive && current === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить событие. Попробуйте ещё раз.')
  } finally { if (alive && current === generation && session === auth.sessionVersion) loading.value = false }
}
function applyItem(value: EventItem) {
  item.value = value
  if (selectedSlot.value) selectedSlot.value = value.slots.find(s => s.id === selectedSlot.value?.id) ?? null
  if (slotAction.value?.slot) {
    const slot = value.slots.find(s => s.id === slotAction.value?.slot?.id)
    slotAction.value = slot ? { ...slotAction.value, slot } : null
  }
  if (!value.can_manage) { slotAction.value = null; if (action.value === 'cancel') action.value = null }
}
// A read failure must never turn a confirmed write into a repeat submission.
async function refreshEvent() {
  if (!item.value) return
  const current = ++generation, session = auth.sessionVersion, eventId = item.value.id
  refreshing.value = true; refreshError.value = ''
  try {
    const result = await api.get<{ data: EventItem }>(`/events/${encodeURIComponent(eventId)}`)
    if (!alive || current !== generation || session !== auth.sessionVersion) return
    applyItem(result.data)
  } catch (error) {
    if (!alive || current !== generation || session !== auth.sessionVersion) return
    const status = apiErrorStatus(error)
    if (status === 403 || status === 404) {
      item.value = null; selectedSlot.value = null; slotAction.value = null; action.value = null
      refreshError.value = `${successMessage.value ? 'Изменение сохранено. ' : ''}Событие больше недоступно.`
    } else {
      refreshError.value = `${successMessage.value ? 'Изменение сохранено, но ' : ''}Не удалось обновить событие. Повторите загрузку.`
    }
  } finally { if (alive && current === generation && session === auth.sessionVersion) refreshing.value = false }
}
function changed() { successMessage.value = 'Изменение сохранено.'; void refreshEvent() }
function savedEvent(value: EventItem) { applyItem(value); action.value = null; changed(); void focusDetail(false) }
function savedSlot() { slotAction.value = null; changed() }
function cancelledEvent() { action.value = null; changed() }
async function focusDetail(editButton: boolean) { await nextTick(); document.querySelector<HTMLElement>(editButton ? '[data-test="edit-event"]:not(:disabled)' : '[data-test="event-detail-heading"]')?.focus() }
function closeEditor() { action.value = null; void focusDetail(true) }
function requestAction(value: 'edit' | 'cancel') { if (item.value?.can_manage && !blocked.value) { action.value = value; selectedSlot.value = null; slotAction.value = null } }
function manageSlot(mode: 'new' | 'edit' | 'remove', slot?: EventSlot) { if (item.value?.can_manage && item.value.status === 'scheduled' && !blocked.value) { slotAction.value = { mode, slot }; selectedSlot.value = null } }
async function createChat() {
  if (!item.value?.can_manage || chatBusy.value || item.value.chat_id || blocked.value) return
  const session = auth.sessionVersion, id = item.value.id
  chatBusy.value = true; chatError.value = ''
  try {
    const result = await api.post<{ data: { id: string } }>(`/events/${encodeURIComponent(id)}/chat`, {})
    if (alive && item.value?.id === id && item.value.can_manage && session === auth.sessionVersion) await router.push(`/chats/${encodeURIComponent(result.data.id)}`)
  } catch (failure) { if (alive && item.value?.id === id && session === auth.sessionVersion) chatError.value = apiErrorMessage(failure, 'Не удалось создать чат события. Попробуйте ещё раз.') }
  finally { if (alive && item.value?.id === id && session === auth.sessionVersion) chatBusy.value = false }
}
function requestAssignment(slot: EventSlot) { if (slot.can_fill && !blocked.value) { selectedSlot.value = slot; action.value = null; slotAction.value = null } }
watch(() => route.params.id, () => { void load() })
watch(() => auth.permissions, () => {
  if (!item.value) return
  const viewsPeople = can('people.view')
  if (couldViewPeople && !viewsPeople) selectedSlot.value = null
  couldViewPeople = viewsPeople
  const value = item.value
  const manages = value.owner_type === 'church' ? can('calendar.church.manage') : canIn(value.ministry!.id, 'events.manage')
  // Revoke locally at once; server capabilities remain the ceiling. A same-account
  // refresh keeps the editor instance and its permitted input and saved notices.
  applyItem({ ...value, can_manage: value.can_manage && manages, slots: value.slots.map(slot => ({ ...slot,
    can_fill: slot.can_fill && (manages || !!slot.role?.ministry_id && canIn(slot.role.ministry_id, 'slots.assign')),
    assignments: slot.assignments.map(assignment => can('people.view') || assignment.person.id === auth.person?.id ? assignment : { ...assignment, person: { ...assignment.person, full_name: null, photo_thumb_url: null } }),
  })) })
  if (selectedSlot.value && !selectedSlot.value.can_fill) selectedSlot.value = null
  void refreshEvent()
}, { deep: true })
watch(() => auth.sessionVersion, () => { generation++; item.value = null; action.value = null; selectedSlot.value = null; slotAction.value = null; loading.value = false; refreshing.value = false; refreshError.value = ''; successMessage.value = ''; chatError.value = ''; errorMessage.value = ''; chatBusy.value = false }, { flush: 'sync' })
onBeforeUnmount(() => { alive = false; generation++ })
defineExpose({ load, action, selectedSlot })
await load()
</script>

<template>
  <main class="event-page">
    <NuxtLink class="event-page__return" data-test="calendar-return" :to="safeCalendarReturn(route.query.return)">Календарь</NuxtLink>
    <p v-if="loading" role="status">Загружаем событие…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" @click="load">Повторить</button></p>
    <p v-if="successMessage" role="status">{{ successMessage }}</p>
    <p v-if="refreshing" role="status">Обновляем событие…</p>
    <p v-if="refreshError" role="alert">{{ refreshError }} <button v-if="item" type="button" class="ui-button" data-test="retry-assignments" @click="refreshEvent">Повторить загрузку</button></p>
    <template v-if="item && action === 'edit'">
      <PageHeader title="Редактирование события" :description="item.title" />
      <EventEditor :event="item" @saved="savedEvent" @cancel="closeEditor" />
    </template>
    <EventCard v-else-if="item" :event="item" detail :disabled="blocked" @edit="requestAction('edit')" @cancel="requestAction('cancel')" @assign="requestAssignment" @assignments-changed="changed" @manage-slot="manageSlot">
      <template #actions>
        <NuxtLink v-if="item.chat_id" class="ui-button" data-test="open-chat" :to="`/chats/${encodeURIComponent(item.chat_id)}`">Открыть чат</NuxtLink>
        <button v-else-if="item.can_manage" type="button" class="ui-button" data-test="create-chat" :disabled="chatBusy || blocked" @click="createChat">Создать чат</button>
        <p v-if="chatError" role="alert">{{ chatError }}</p>
      </template>
    </EventCard>
    <AssignDialog v-if="item && selectedSlot" :key="`${item.id}-${selectedSlot.id}`" v-bind="{ slot: selectedSlot }" :event-id="item.id" :disabled="blocked" @assigned="changed" @close="selectedSlot = null" />
    <CancelEventDialog v-if="item && action === 'cancel'" :event-id="item.id" @saved="cancelledEvent" @cancel="action = null" />
    <EventSlotManager v-if="item && slotAction" v-bind="{ slot: slotAction.slot }" :event="item" :mode="slotAction.mode" @saved="savedSlot" @close="slotAction = null" />
  </main>
</template>

<style scoped>
.event-page { min-width: 0; width: 100%; max-width: var(--ui-content-width); margin-inline: auto; overflow-wrap: anywhere; display: grid; gap: var(--ui-space-4); }
.event-page > a, .event-page > button { justify-self: start; max-width: 100%; }
.event-page__return { display: inline-flex; align-items: center; min-width: 44px; min-height: 44px; padding-block: 8px; }
</style>
