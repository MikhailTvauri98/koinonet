<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays, calendarWeekStart } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
import EventList from '~/components/calendar/EventList.vue'
const settings = useSettingsStore(), auth = useAuthStore()
const { todayInChurch } = useChurchDate(), { load: loadEvents } = useEvents()
const { can, canIn } = useCan()
const canCreate = computed(() => can('calendar.church.manage') || can('ministries.manage_all') || Object.keys(auth.permissions.ministries).some(id => canIn(id, 'events.manage')))
const events = ref<EventItem[]>([]), scope = ref('church'), week = ref('')
const loading = ref(false), errorMessage = ref('')
let generation = 0
const formatPeriodDate = (day: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', dateStyle: 'short' }).format(new Date(`${day}T00:00:00Z`))
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
  <main class="calendar-page">
    <header class="calendar-heading"><h1>Календарь</h1><NuxtLink v-if="canCreate" class="primary-action" to="/events/new">Создать событие</NuxtLink></header>
    <div class="calendar-controls" role="group" aria-label="Область календаря">
      <button type="button" data-test="scope-church" :aria-pressed="scope === 'church'" @click="selectScope('church')">Все</button>
      <button type="button" data-test="scope-mine" :aria-pressed="scope === 'mine'" @click="selectScope('mine')">Мои</button>
    </div>
    <div v-if="range" class="calendar-period" role="group" aria-label="Период календаря">
      <button type="button" data-test="previous-week" @click="moveWeek(-7)">← Неделя назад</button>
      <p class="calendar-period__dates"><span><time :datetime="range.from">{{ formatPeriodDate(range.from) }}</time> — <time :datetime="range.to">{{ formatPeriodDate(range.to) }}</time></span><small>{{ settings.timezone }}</small></p>
      <button type="button" data-test="next-week" @click="moveWeek(7)">Неделя вперёд →</button>
    </div>
    <p v-if="loading" role="status">Загружаем календарь…</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" data-test="retry-calendar" @click="load">Повторить</button></p>
    <EventList v-else :events="events" />
  </main>
</template>

<style scoped>
.calendar-page { min-width: 0; width: 100%; max-width: var(--ui-content-width); margin-inline: auto; overflow-wrap: anywhere; }
.calendar-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-4); margin-bottom: var(--ui-space-6); }
h1 { margin: 0; }
.primary-action { display: inline-flex; align-items: center; justify-content: center; min-height: var(--ui-control-height); padding: var(--ui-space-2) var(--ui-space-4); border: 1px solid; border-radius: var(--ui-radius-sm); text-decoration: none; font-weight: 600; background: var(--ui-accent); color: var(--ui-surface); border-color: var(--ui-accent); }
.primary-action:hover { background: var(--ui-accent-hover); }
.calendar-controls { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin-bottom: var(--ui-space-4); }
[aria-pressed='true'] { background: var(--ui-accent); color: var(--ui-surface); border-color: var(--ui-accent); }
.calendar-period { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow); padding: min(var(--ui-space-4), 16px); margin-bottom: var(--ui-space-6); }
.calendar-period__dates { min-width: 0; flex: 1 1 16rem; display: grid; gap: var(--ui-space-1); margin: 0; text-align: center; }
.calendar-period__dates span { overflow-wrap: anywhere; }
small { color: var(--ui-text-muted); }
button { max-width: 100%; }
@media (max-width: 40rem) { .calendar-period__dates { flex-basis: 100%; order: -1; } .calendar-period > button { flex: 1 1 7rem; } }
</style>
