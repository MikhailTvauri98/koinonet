<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays, groupByChurchDay } from '~/composables/useEvents'
import { isConnectionFailure, apiErrorMessage } from '~/utils/apiError'
import { isAssigned } from '~/utils/assignments'
import { ministryColorVar } from '~/utils/ministryColor'
const props = defineProps<{ from: string }>()
const { load: loadEvents } = useEvents(), { formatTime, formatWeekdayShort } = useChurchDate()
const auth = useAuthStore(), settings = useSettingsStore()
const items = ref<EventItem[]>([]), loaded = ref(false), loading = ref(false), errorMessage = ref(''), offline = ref(false)
let generation = 0, requestedFrom = ''
async function load() {
  const current = ++generation, session = auth.sessionVersion
  const active = () => current === generation && session === auth.sessionVersion
  loading.value = true; errorMessage.value = ''; offline.value = false
  try {
    await settings.fetch()
    if (!active()) return
    const from = requestedFrom = props.from
    const result = await loadEvents({ from, to: addCalendarDays(from, 6) }, 'church')
    if (active()) { items.value = result; loaded.value = true }
  } catch (error) {
    if (!active()) return
    // Обрыв связи: остаётся последний список без красного текста, статус показывает общий индикатор.
    if (isConnectionFailure(error)) offline.value = true
    else errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить события недели.')
  } finally { if (active()) loading.value = false }
}
const rows = computed(() => groupByChurchDay(items.value, settings.timezone).flatMap(group => group.events.map(event => ({ event, day: group.day }))))
const me = computed(() => auth.person?.id)
const link = (event: EventItem, day: string) => ({ path: `/events/${encodeURIComponent(event.id)}`, query: { return: `/calendar?date=${day}&view=list&scope=church` } })
watch(() => auth.sessionVersion, () => { generation++; items.value = []; loaded.value = false; loading.value = false; errorMessage.value = ''; offline.value = false; requestedFrom = '' })
watch(() => props.from, (from) => { if (settings.loaded && from !== requestedFrom) void load() })
onBeforeUnmount(() => { generation++ })
void load()
</script>

<template>
  <section class="home-section home-section--week" aria-label="На этой неделе">
    <header class="home-section__header"><h2>На этой неделе</h2><NuxtLink class="ui-button ui-button--quiet" to="/calendar">Календарь</NuxtLink></header>
    <p v-if="loading && !loaded" role="status">Загружаем события…</p>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" :disabled="loading" @click="load">Повторить</button></p>
    <ul v-if="rows.length" class="week-list">
      <li v-for="{ event, day } in rows" :key="event.id" class="week-row" :class="{ 'week-row--cancelled': event.status === 'cancelled' }" :style="{ '--stripe': ministryColorVar(event.ministry) }" data-test="week-event">
        <time class="week-row__when" :datetime="event.starts_at"><span>{{ formatWeekdayShort(event.starts_at) }}</span><strong>{{ formatTime(event.starts_at) }}</strong></time>
        <div class="week-row__body">
          <NuxtLink class="week-row__title" :to="link(event, day)">{{ event.title }}</NuxtLink>
          <span class="week-row__meta">{{ [event.location, event.ministry?.name ?? 'Церковь'].filter(Boolean).join(' · ') }}</span>
        </div>
        <span v-if="event.status === 'cancelled'" class="week-row__tag week-row__tag--cancelled" :data-test="`week-cancelled-${event.id}`">Отменено</span>
        <span v-if="isAssigned(event, me)" class="week-row__tag" :data-test="`week-mine-${event.id}`">Вы</span>
      </li>
    </ul>
    <p v-else-if="loaded && !loading && !offline" class="ui-hint week-empty">На этой неделе событий нет</p>
    <p v-else-if="offline && !loaded" class="ui-hint" role="status">События появятся, когда восстановится связь.</p>
  </section>
</template>

<style scoped>
.week-list { list-style: none; margin: 0; padding: 0; }
.week-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-1) var(--ui-space-3); min-width: 0; padding: var(--ui-space-2) 0 var(--ui-space-2) var(--ui-space-3); border-bottom: 1px solid var(--ui-border); border-inline-start: 4px solid var(--stripe); }
.week-row:last-child { border-bottom: 0; }
.week-row__when { display: grid; justify-items: start; min-width: 3.5rem; line-height: 1.25; font-variant-numeric: tabular-nums; }
.week-row__when span { color: var(--ui-text-muted); font-size: .875rem; }
.week-row__body { display: grid; flex: 1 1 10rem; min-width: 0; }
.week-row__title { display: inline-flex; align-items: center; min-height: var(--ui-control-height); font-weight: 600; color: inherit; text-decoration: none; }
.week-row__title:hover { text-decoration: underline; }
.week-row__meta { color: var(--ui-text-muted); font-size: .875rem; margin-top: calc(var(--ui-space-1) * -1); }
.week-row__tag { padding: 2px 10px; border-radius: 999px; background: var(--ui-accent-soft); color: var(--ui-accent); font-size: .875rem; font-weight: 600; }
.week-row__tag--cancelled { background: var(--ui-surface-muted); color: var(--ui-text); }
.week-row--cancelled .week-row__title { text-decoration: line-through; color: var(--ui-text-muted); }
.week-row--cancelled .week-row__when { color: var(--ui-text-muted); }
.week-empty { margin: 0; }
</style>
