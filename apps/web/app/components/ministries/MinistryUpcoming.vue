<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays } from '~/composables/useEvents'
import { apiErrorMessage } from '~/utils/apiError'
import { isAssigned } from '~/utils/assignments'
import { ministryColorVar } from '~/utils/ministryColor'

// «Ближайшие события»: до трёх неоконченных событий служения от сегодняшнего дня по церкви.
// Блок грузится сам: его ошибка не прячет остальные блоки обзора.
const props = defineProps<{ ministryId: string }>()
const auth = useAuthStore(), settings = useSettingsStore()
const { load: loadEvents } = useEvents(), { formatEventWhen, todayInChurch } = useChurchDate()
const items = ref<EventItem[]>([]), loaded = ref(false), loading = ref(false), errorMessage = ref('')
// API отдаёт не больше 93 дней за запрос, поэтому год берётся окнами по 73 дня; поиск идёт, пока не набрались три события.
const WINDOW_DAYS = 73, WINDOWS = 5, SHOWN = 3
const notEnded = (event: EventItem) => Date.parse(event.ends_at) > Date.now()
let generation = 0

async function load() {
  const current = ++generation, session = auth.sessionVersion, id = props.ministryId
  const live = () => current === generation && session === auth.sessionVersion && id === props.ministryId
  loading.value = true; errorMessage.value = ''
  try {
    await settings.fetch()
    if (!live()) return
    const today = todayInChurch()
    let found: EventItem[] = []
    for (let index = 0; index < WINDOWS && found.length < SHOWN; index++) {
      const from = addCalendarDays(today, index * WINDOW_DAYS)
      const part = await loadEvents({ from, to: addCalendarDays(from, WINDOW_DAYS - 1) }, `ministry:${id}`)
      if (!live()) return
      // Событие на стыке окон приходит в обоих: берём по id один раз.
      found = [...found, ...part.filter(event => notEnded(event) && !found.some(known => known.id === event.id))]
    }
    items.value = found; loaded.value = true
  } catch (error) {
    if (live()) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить события служения. Попробуйте ещё раз.')
  } finally { if (live()) loading.value = false }
}
function reset() { generation++; items.value = []; loaded.value = false; errorMessage.value = ''; loading.value = false; if (auth.user) void load() }
watch([() => props.ministryId, () => auth.sessionVersion], reset, { flush: 'sync' })
onBeforeUnmount(() => { generation++ })

const rows = computed(() => items.value.filter(notEnded).slice(0, SHOWN))
const me = computed(() => auth.person?.id)
function freePlaces(event: EventItem) {
  if (!event.can_manage && !event.slots.some(slot => slot.can_fill)) return 0
  return event.slots.reduce((sum, slot) => sum + Math.max(0, slot.required_count - slot.filled_count), 0)
}
function placesLabel(count: number) {
  const mod100 = count % 100, mod10 = count % 10
  return `${count} ${mod100 >= 11 && mod100 <= 14 ? 'мест' : mod10 === 1 ? 'место' : mod10 >= 2 && mod10 <= 4 ? 'места' : 'мест'}`
}
const link = (event: EventItem) => ({ path: `/events/${encodeURIComponent(event.id)}`, query: { return: `/ministries/${props.ministryId}` } })
void load()
</script>

<template>
  <section class="overview-block" aria-labelledby="overview-events-title" data-test="overview-events">
    <header class="overview-block__header">
      <h2 id="overview-events-title">Ближайшие события</h2>
      <NuxtLink class="ui-button ui-button--quiet" :to="`/ministries/${encodeURIComponent(ministryId)}/events`" data-test="all-events" aria-label="Все события служения">Все события</NuxtLink>
    </header>
    <p v-if="loading && !loaded" role="status">Загружаем события…</p>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" data-test="retry-events" :disabled="loading" @click="load">Повторить</button></p>
    <ul v-if="rows.length" class="overview-events">
      <li v-for="event in rows" :key="event.id" class="overview-event" :class="{ 'overview-event--cancelled': event.status === 'cancelled' }" :style="{ '--stripe': ministryColorVar(event.ministry) }" data-test="overview-event">
        <div class="overview-event__body">
          <NuxtLink class="overview-event__title" :to="link(event)">{{ event.title }}</NuxtLink>
          <span class="overview-event__when">{{ formatEventWhen(event.starts_at, event.ends_at) }}</span>
        </div>
        <span v-if="event.status === 'cancelled'" class="overview-event__tag overview-event__tag--neutral" :data-test="`overview-cancelled-${event.id}`">Отменено</span>
        <span v-if="isAssigned(event, me)" class="overview-event__tag" :data-test="`overview-mine-${event.id}`">Вы</span>
        <span v-if="event.status !== 'cancelled' && freePlaces(event) > 0" class="overview-event__tag overview-event__tag--neutral" :data-test="`overview-places-${event.id}`">{{ placesLabel(freePlaces(event)) }}</span>
      </li>
    </ul>
    <p v-else-if="loaded && !loading && !errorMessage" class="ui-hint" data-test="overview-events-empty">Ближайших событий нет</p>
  </section>
</template>

<style scoped>
.overview-events { list-style: none; margin: 0; padding: 0; }
.overview-event { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-1) var(--ui-space-3); min-width: 0; padding: var(--ui-space-2) 0 var(--ui-space-2) var(--ui-space-3); border-bottom: 1px solid var(--ui-border); border-inline-start: 4px solid var(--stripe); }
.overview-event:last-child { border-bottom: 0; }
.overview-event__body { display: grid; flex: 1 1 10rem; min-width: 0; }
.overview-event__title { display: inline-flex; align-items: center; min-height: var(--ui-control-height); font-weight: 600; color: inherit; text-decoration: none; }
.overview-event__title:hover { text-decoration: underline; }
.overview-event__title::after { content: ''; position: absolute; inset: 0; }
.overview-event:focus-within { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
.overview-event__title:focus-visible { outline: none; }
.overview-event__when { color: var(--ui-text-muted); font-size: .875rem; margin-top: calc(var(--ui-space-1) * -1); }
.overview-event__tag { padding: 2px 10px; border-radius: 999px; background: var(--ui-accent-soft); color: var(--ui-accent); font-size: .875rem; font-weight: 600; }
.overview-event__tag--neutral { background: var(--ui-surface-muted); color: var(--ui-text); }
.overview-event--cancelled .overview-event__title { text-decoration: line-through; color: var(--ui-text-muted); }
[role='alert'] { color: var(--ui-danger); }
</style>
