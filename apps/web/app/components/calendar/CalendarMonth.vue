<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays, formatCalendarDay, groupCalendarDays } from '~/composables/useEvents'
import { calendarRange } from '~/composables/useCalendarView'
import { isAssigned } from '~/utils/assignments'
import { ministryColorVar } from '~/utils/ministryColor'
const props = defineProps<{ events: EventItem[], date: string }>()
defineEmits<{ select: [day: string], open: [event: EventItem] }>()
const settings = useSettingsStore(), auth = useAuthStore(), { todayInChurch, formatTime } = useChurchDate()
const range = computed(() => calendarRange({ date: props.date, view: 'month', scope: 'church' }))
const grouped = computed(() => new Map(groupCalendarDays(props.events, settings.timezone, range.value).map(group => [group.day, group.events])))
const days = computed(() => { const result: string[] = []; for (let day = range.value.from; day <= range.value.to; day = addCalendarDays(day, 1)) result.push(day); return result })
const mine = (event: EventItem) => isAssigned(event, auth.person?.id)
const cancelled = (event: EventItem) => event.status === 'cancelled'
const visible = (day: string) => (grouped.value.get(day) ?? []).slice(0, MONTH_CELL_LIMIT)
const hidden = (day: string) => Math.max(0, (grouped.value.get(day)?.length ?? 0) - MONTH_CELL_LIMIT)
function timeLabel(event: EventItem, day: string) {
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const start = format.format(new Date(event.starts_at)), end = format.format(new Date(Date.parse(event.ends_at) - 1))
  return day > start ? day === end ? `До ${formatTime(event.ends_at)}` : 'Продолжается' : `${formatTime(event.starts_at)}${end > start ? ' · начало' : ''}`
}
</script>
<script lang="ts">
// Сколько событий видно в клетке месяца; остальные открываются по «Ещё N» в панели дня.
export const MONTH_CELL_LIMIT = 3
</script>
<template>
  <div class="calendar-month-scroll" role="region" aria-label="Месяц: сетка дней" tabindex="0"><div class="calendar-month" aria-label="Месяц">
    <span v-for="day in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']" :key="day" class="calendar-month__weekday">{{ day }}</span>
    <div v-for="day in days" :key="day" class="calendar-month__day" :class="{ 'is-outside': day.slice(0, 7) !== date.slice(0, 7), 'is-selected': day === date }" :data-test="`day-${day}`">
      <button type="button" class="calendar-month__date" :class="{ 'is-today': day === todayInChurch() }" :aria-label="`${formatCalendarDay(day)}, событий: ${grouped.get(day)?.length ?? 0}`" :aria-pressed="day === date" @click="$emit('select', day)">{{ Number(day.slice(-2)) }}<span class="calendar-month__count">{{ grouped.get(day)?.length || '' }}</span></button>
      <button v-for="event in visible(day)" :key="event.id" type="button" class="calendar-month__event ui-tinted" :class="{ 'is-cancelled': cancelled(event), 'is-mine': mine(event) }" :style="{ '--tint-color': ministryColorVar(event.ministry) }" :data-test="`event-${day}-${event.id}`" :title="`${event.title} · ${event.ministry?.name || 'Церковь'}${cancelled(event) ? ' · Отменено' : ''}`" @click="$emit('open', event)">
        <span class="calendar-month__text"><span v-if="mine(event)" class="calendar-month__you">Вы</span> {{ timeLabel(event, day) }} {{ event.title }}<span v-if="cancelled(event)" class="visually-hidden"> · Отменено</span></span>
        <span class="calendar-month__owner">{{ event.ministry?.name || 'Церковь' }}</span>
      </button>
      <button v-if="hidden(day) > 0" type="button" class="calendar-month__more" :data-test="`overflow-${day}`" @click="$emit('select', day)">Ещё {{ hidden(day) }}</button>
    </div>
  </div></div>
</template>
<style scoped>
.calendar-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-width: 0; align-content: start; border-top: 1px solid var(--ui-border); border-left: 1px solid var(--ui-border); }
.calendar-month__weekday { padding: var(--ui-space-2) 0; color: var(--ui-text-muted); text-align: center; font-size: .875rem; border-right: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border); }
.calendar-month__day { min-width: 0; min-height: 96px; padding: 4px; border-right: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border); background: var(--ui-surface); }
.is-outside { background: var(--ui-canvas); color: var(--ui-text-muted); }
.is-selected { background: var(--ui-accent-soft); box-shadow: inset 0 0 0 1px var(--ui-accent); }
.calendar-month__date { min-width: 44px; min-height: 44px; padding: 8px; background: transparent; border: 0; margin-bottom: 4px; }
.calendar-month__date.is-today { background: var(--ui-accent); color: var(--ui-on-accent); }
.calendar-month__event { display: flex; align-items: flex-start; gap: 4px; width: 100%; min-width: 0; min-height: 44px; margin-bottom: 4px; border: 0; border-left: 4px solid var(--tint-color); border-radius: 4px; padding: 6px; font-size: .875rem; line-height: 1.3; text-align: left; }
.calendar-month__text { flex: 1 1 auto; min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.calendar-month__you { padding: 0 6px; border: 1px solid currentColor; border-radius: 999px; font-weight: 600; }
.calendar-month__event { flex-direction: column; }
.calendar-month__owner { max-width: 100%; overflow-wrap: anywhere; }
.calendar-month__event.is-cancelled { background: var(--ui-surface-muted); color: var(--ui-text-muted); border-left-color: var(--ui-text-muted); }
.calendar-month__event.is-cancelled .calendar-month__text { text-decoration: line-through; }
.calendar-month__more { min-height: 44px; max-width: 100%; border: 0; background: transparent; color: var(--ui-accent); padding: 4px; font-size: .875rem; }
.visually-hidden { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
.calendar-month__count { display: none; }
.calendar-month-scroll { min-width: 0; max-width: 100%; overflow-x: auto; }
@media (max-width: 1023px) { .calendar-month { min-width: 322px; } .calendar-month__day { padding: 0; min-height: 64px; } .calendar-month__date { width: 100%; min-width: 44px; min-height: 64px; padding: 4px 0; margin: 0; } .calendar-month__event, .calendar-month__more { display: none; } .calendar-month__count { display: block; font-size: .875rem; } }
</style>
