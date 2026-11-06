<script setup lang="ts">
import type { EventItem, EventRange } from '~/composables/useEvents'
import type { CalendarView } from '~/composables/useCalendarView'
import { formatCalendarDay, groupCalendarDays } from '~/composables/useEvents'
import CalendarMonth from './CalendarMonth.vue'
import EventList from './EventList.vue'
const props = defineProps<{ events: EventItem[], state: CalendarView, range: EventRange, returnContext: string, canCreate?: boolean, ministryId?: string, ministries?: { id: string, name: string }[], loading?: boolean, error?: string }>()
const emit = defineEmits<{ update: [change: Partial<CalendarView>], today: [], move: [delta: number], retry: [] }>()
const settings = useSettingsStore(), router = useRouter()
const selected = ref<HTMLElement | null>(null)
const pendingSelection = ref(false)
const monthLabel = computed(() => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(props.state.date + 'T00:00:00Z')))
const dayLabel = computed(() => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(props.state.date + 'T00:00:00Z')))
const selectedEvents = computed(() => groupCalendarDays(props.events, settings.timezone, { from: props.state.date, to: props.state.date })[0]?.events ?? [])
const createLink = computed(() => ({ path: '/events/new', query: { date: props.state.date, ...(props.ministryId ? { ministry: props.ministryId } : {}), return: props.returnContext } }))
function select(day: string) { pendingSelection.value = true; emit('update', { date: day }); void focusSelection() }
async function focusSelection() { await nextTick(); if (!pendingSelection.value || props.loading || !selected.value) return; selected.value.scrollIntoView?.({ block: 'nearest' }); selected.value.focus({ preventScroll: true }); pendingSelection.value = false }
watch(() => [props.state.date, props.loading], () => { void focusSelection() }, { flush: 'post' })
function open(event: EventItem) { void router.push({ path: `/events/${encodeURIComponent(event.id)}`, query: { return: props.returnContext } }) }
</script>
<template>
  <section class="calendar-browser">
    <div class="calendar-toolbar">
      <div class="calendar-toolbar__month" role="group" aria-label="Период календаря"><h2>{{ monthLabel }}</h2><button class="ui-button" type="button" aria-label="Предыдущий месяц" data-test="previous-month" @click="$emit('move', -1)">‹</button><button class="ui-button" type="button" aria-label="Следующий месяц" data-test="next-month" @click="$emit('move', 1)">›</button></div>
      <button class="ui-button" type="button" data-test="calendar-today" @click="$emit('today')">Сегодня</button>
      <label class="calendar-toolbar__date"><span class="visually-hidden">Перейти к дате</span><input type="date" data-test="calendar-date" :value="state.date" @change="select(($event.target as HTMLInputElement).value)"></label>
      <div v-if="!ministryId" class="calendar-switch" role="group" aria-label="Область календаря"><button v-for="scope in ['church', 'mine']" :key="scope" type="button" :data-test="`scope-${scope}`" :aria-pressed="state.scope === scope" @click="emit('update', { scope })">{{ scope === 'church' ? 'Все' : 'Мои' }}</button></div>
      <label v-if="!ministryId && ministries?.length" class="calendar-ministry"><span>Служение</span><select :value="state.scope.startsWith('ministry:') ? state.scope : 'church'" @change="emit('update', { scope: ($event.target as HTMLSelectElement).value })"><option value="church">Все служения</option><option v-for="item in ministries" :key="item.id" :value="`ministry:${item.id}`">{{ item.name }}</option></select></label>
      <div class="calendar-switch" role="group" aria-label="Вид календаря"><button v-for="view in (['month', 'list'] as const)" :key="view" type="button" :aria-pressed="state.view === view" @click="emit('update', { view })">{{ view === 'month' ? 'Месяц' : 'Список' }}</button></div>
    </div>
    <p class="calendar-zone">Время церкви · {{ settings.timezone }}<span v-if="state.scope === 'mine'"> · Ваши назначения</span></p>
    <p v-if="loading" role="status">Загружаем календарь…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" class="ui-button" data-test="retry-calendar" @click="$emit('retry')">Повторить</button></p>
    <div v-else-if="state.view === 'month'" class="calendar-layout">
      <CalendarMonth :events="events" :date="state.date" @select="select" @open="open" />
      <section ref="selected" class="calendar-selected" data-test="selected-day" tabindex="-1" aria-label="Выбранный день"><h2><time :datetime="state.date">{{ formatCalendarDay(state.date) }}</time></h2><NuxtLink v-if="canCreate" class="ui-button" :to="createLink">Создать на {{ dayLabel }}</NuxtLink><EventList :events="selectedEvents" :range="{ from: state.date, to: state.date }" :return-context="returnContext" hide-date empty-description="На выбранный день доступных событий нет." /></section>
    </div>
    <template v-else>
      <section ref="selected" class="calendar-selected calendar-selected--list" data-test="selected-day" tabindex="-1" aria-label="Выбранный день"><h2><time :datetime="state.date">{{ formatCalendarDay(state.date) }}</time></h2><NuxtLink v-if="canCreate" class="ui-button" :to="createLink">Создать на {{ dayLabel }}</NuxtLink><EventList :events="selectedEvents" :range="{ from: state.date, to: state.date }" :return-context="returnContext" hide-date empty-description="На выбранный день доступных событий нет." /></section>
      <h2 class="calendar-remaining">Остальные события месяца</h2><EventList :events="events" :range="range" :return-context="returnContext" :exclude-date="state.date" />
    </template>
  </section>
</template>
<style scoped>
.calendar-browser { min-width: 0; container-type: inline-size; }
.calendar-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); }
.calendar-toolbar__month { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.25rem; }
.calendar-toolbar__month h2 { margin-right: var(--ui-space-3); }
.calendar-toolbar__date, .calendar-ministry { min-width: 0; max-width: 100%; }
.calendar-toolbar__date input { width: 12rem; min-width: 0; max-width: 100%; }
.calendar-ministry { display: grid; gap: 4px; font-size: .875rem; flex: 0 1 14rem; }
.calendar-ministry select { width: 100%; }
.calendar-switch { display: flex; flex-wrap: wrap; border: 1px solid var(--ui-border); padding: 3px; border-radius: var(--ui-radius-sm); background: var(--ui-surface); }
.calendar-switch button { min-height: 44px; padding: 8px 12px; border: 0; background: transparent; }
.calendar-switch button[aria-pressed=true] { color: var(--ui-accent); background: var(--ui-accent-soft); }
.calendar-zone { font-size: .875rem; color: var(--ui-text-muted); margin: var(--ui-space-4) 0 var(--ui-space-6); }
.calendar-layout { display: grid; gap: var(--ui-space-6); align-items: start; min-width: 0; }
.calendar-selected { min-width: 0; display: grid; gap: var(--ui-space-3); }
.calendar-selected > a { justify-self: start; max-width: 100%; }
.calendar-remaining { margin-block: var(--ui-space-6) var(--ui-space-4); }
.calendar-list-selection { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-3); margin-bottom: var(--ui-space-4); }
.calendar-list-selection p { margin: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; }
@container (min-width: 1000px) { .calendar-layout { grid-template-columns: minmax(0, 1fr) 300px; } }
@container (max-width: 450px) { .calendar-toolbar__month { flex-basis: 100%; } .calendar-toolbar__month h2 { flex: 1 1 8rem; } .calendar-toolbar__date { flex: 1 1 11rem; } .calendar-toolbar__date input { width: 100%; } }
</style>
