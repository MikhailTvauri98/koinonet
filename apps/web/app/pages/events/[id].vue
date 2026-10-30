<script setup lang="ts">
import type { EventItem, EventSlot } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
import EventCard from '~/components/calendar/EventCard.vue'
const api = useApi(), route = useRoute(), auth = useAuthStore(), settings = useSettingsStore()
const item = ref<EventItem | null>(null), errorMessage = ref(''), loading = ref(false)
// Integration points: task16 supplies editor/cancellation, task17 assignment dialog.
const action = ref<'edit' | 'cancel' | null>(null), selectedSlot = ref<EventSlot | null>(null)
let generation = 0
async function load() {
  const current = ++generation, session = auth.sessionVersion
  item.value = null; action.value = null; selectedSlot.value = null; errorMessage.value = ''; loading.value = true
  try {
    await settings.fetch()
    if (current !== generation || session !== auth.sessionVersion) return
    const result = await api.get<{ data: EventItem }>(`/events/${encodeURIComponent(String(route.params.id))}`)
    if (current === generation && session === auth.sessionVersion) item.value = result.data
  } catch (error) {
    if (current === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить событие. Попробуйте ещё раз.')
  } finally { if (current === generation && session === auth.sessionVersion) loading.value = false }
}
function requestAction(value: 'edit' | 'cancel') { if (item.value?.can_manage) { action.value = value; selectedSlot.value = null } }
function requestAssignment(slot: EventSlot) { if (slot.can_fill) { selectedSlot.value = slot; action.value = null } }
watch(() => route.params.id, () => { void load() })
watch(() => auth.sessionVersion, () => { generation++; item.value = null; action.value = null; selectedSlot.value = null; loading.value = false })
onBeforeUnmount(() => { generation++ })
defineExpose({ load, action, selectedSlot })
await load()
</script>

<template>
  <main>
    <NuxtLink to="/calendar">Календарь</NuxtLink>
    <p v-if="loading" role="status">Загружаем событие…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" @click="load">Повторить</button></p>
    <EventCard v-if="item" :event="item" detail @edit="requestAction('edit')" @cancel="requestAction('cancel')" @assign="requestAssignment" />
  </main>
</template>
