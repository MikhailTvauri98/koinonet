<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays, calendarWeekStart, formatCalendarDay } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
import EventList from '~/components/calendar/EventList.vue'
const settings = useSettingsStore(), auth = useAuthStore()
const { todayInChurch } = useChurchDate(), { load: loadEvents } = useEvents()
const events = ref<EventItem[]>([]), scope = ref('church'), week = ref('')
const loading = ref(false), errorMessage = ref('')
let generation = 0
const range = computed(() => week.value ? { from: week.value, to: addCalendarDays(week.value, 27) } : null)
async function load() {
  const current = ++generation, session = auth.sessionVersion
  loading.value = true; errorMessage.value = ''; events.value = []
  try {
    await settings.fetch()
    if (current !== generation || session !== auth.sessionVersion) return
    if (!week.value) week.value = calendarWeekStart(todayInChurch())
    const result = await loadEvents(range.value!, scope.value)
    if (current === generation && session === auth.sessionVersion) events.value = result
  } catch (error) {
    if (current === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить календарь. Попробуйте ещё раз.')
  } finally { if (current === generation && session === auth.sessionVersion) loading.value = false }
}
function selectScope(value: string) { if (scope.value !== value) { scope.value = value; void load() } }
function moveWeek(days: number) { if (week.value) { week.value = addCalendarDays(week.value, days); void load() } }
watch(() => auth.sessionVersion, () => { generation++; events.value = []; week.value = ''; loading.value = false; errorMessage.value = '' })
watch(() => settings.timezone, () => { if (settings.loaded && week.value) { week.value = ''; void load() } })
onBeforeUnmount(() => { generation++ })
await load()
</script>

<template>
  <main>
    <h1>Календарь</h1>
    <div class="calendar-controls" role="group" aria-label="Область календаря">
      <button type="button" data-test="scope-church" :aria-pressed="scope === 'church'" @click="selectScope('church')">Все</button>
      <button type="button" data-test="scope-mine" :aria-pressed="scope === 'mine'" @click="selectScope('mine')">Мои</button>
    </div>
    <div v-if="range" class="calendar-controls" role="group" aria-label="Период календаря">
      <button type="button" data-test="previous-week" @click="moveWeek(-7)">← Неделя назад</button>
      <p>{{ formatCalendarDay(range.from) }} — {{ formatCalendarDay(range.to) }}</p>
      <button type="button" data-test="next-week" @click="moveWeek(7)">Неделя вперёд →</button>
    </div>
    <p v-if="loading" role="status">Загружаем календарь…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" data-test="retry-calendar" @click="load">Повторить</button></p>
    <EventList v-else :events="events" />
  </main>
</template>

<style scoped>
.calendar-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
button { font: inherit; padding: 0.5rem 0.75rem; cursor: pointer; }
[aria-pressed='true'] { background: #234e79; color: white; }
[role='alert'] { color: #a32020; }
</style>
