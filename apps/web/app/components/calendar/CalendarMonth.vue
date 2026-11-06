<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays, formatCalendarDay, groupCalendarDays } from '~/composables/useEvents'
import { calendarRange } from '~/composables/useCalendarView'
const props = defineProps<{ events: EventItem[], date: string }>()
defineEmits<{ select: [day: string], open: [event: EventItem] }>()
const settings = useSettingsStore(), { todayInChurch, formatTime } = useChurchDate()
const range = computed(() => calendarRange({ date: props.date, view: 'month', scope: 'church' }))
const grouped = computed(() => new Map(groupCalendarDays(props.events, settings.timezone, range.value).map(group => [group.day, group.events])))
const days = computed(() => { const result: string[] = []; for (let day = range.value.from; day <= range.value.to; day = addCalendarDays(day, 1)) result.push(day); return result })
function timeLabel(event: EventItem, day: string) {
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const start = format.format(new Date(event.starts_at)), end = format.format(new Date(Date.parse(event.ends_at) - 1))
  return day > start ? day === end ? `До ${formatTime(event.ends_at)}` : 'Продолжается' : `${formatTime(event.starts_at)}${end > start ? ' · начало' : ''}`
}
</script>
<template>
  <div class="calendar-month-scroll" role="region" aria-label="Месяц: сетка дней" tabindex="0"><div class="calendar-month" aria-label="Месяц">
    <span v-for="day in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']" :key="day" class="calendar-month__weekday">{{ day }}</span>
    <div v-for="day in days" :key="day" class="calendar-month__day" :class="{ 'is-outside': day.slice(0, 7) !== date.slice(0, 7), 'is-selected': day === date }" :data-test="`day-${day}`">
      <button type="button" class="calendar-month__date" :class="{ 'is-today': day === todayInChurch() }" :aria-label="`${formatCalendarDay(day)}, событий: ${grouped.get(day)?.length ?? 0}`" :aria-pressed="day === date" @click="$emit('select', day)">{{ Number(day.slice(-2)) }}<span class="calendar-month__count">{{ grouped.get(day)?.length || '' }}</span></button>
      <button v-for="event in (grouped.get(day) ?? []).slice(0, 1)" :key="event.id" type="button" class="calendar-month__event" :class="{ 'is-cancelled': event.status === 'cancelled' }" :title="`${event.title}${event.status === 'cancelled' ? ' · Отменено' : ''}`" @click="$emit('open', event)"><span>{{ timeLabel(event, day) }}</span>{{ event.title }}<span v-if="event.status === 'cancelled'"> · Отменено</span></button>
      <button v-if="(grouped.get(day)?.length ?? 0) > 1" type="button" class="calendar-month__more" :data-test="`overflow-${day}`" @click="$emit('select', day)">Ещё {{ grouped.get(day)!.length - 1 }}</button>
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
.calendar-month__event { display: block; width: 100%; min-width: 0; min-height: 44px; border: 0; border-left: 2px solid var(--ui-accent); background: var(--ui-surface-muted); border-radius: 4px; padding: 6px; font-size: .875rem; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.calendar-month__event > span:first-child { display: block; color: var(--ui-text-muted); }
.calendar-month__event.is-cancelled { border-left-color: var(--ui-text-muted); }
.calendar-month__more { min-height: 44px; max-width: 100%; border: 0; background: transparent; color: var(--ui-accent); padding: 4px; font-size: .875rem; }
.calendar-month__count { display: none; }
.calendar-month-scroll { min-width: 0; max-width: 100%; overflow-x: auto; }
@media (max-width: 1023px) { .calendar-month { min-width: 322px; } .calendar-month__day { padding: 0; min-height: 64px; } .calendar-month__date { width: 100%; min-width: 44px; min-height: 64px; padding: 4px 0; margin: 0; } .calendar-month__event, .calendar-month__more { display: none; } .calendar-month__count { display: block; font-size: .875rem; } }
</style>
