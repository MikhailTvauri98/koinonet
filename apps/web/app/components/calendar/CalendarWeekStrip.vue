<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays, calendarWeekStart, groupCalendarDays } from '~/composables/useEvents'
import { ministryColorVar } from '~/utils/ministryColor'
const props = defineProps<{ date: string, events: EventItem[] }>()
const emit = defineEmits<{ select: [day: string], shift: [weeks: number] }>()
const settings = useSettingsStore(), { todayInChurch } = useChurchDate()
const SWIPE_DISTANCE = 40
const weekStart = computed(() => calendarWeekStart(props.date))
const range = computed(() => ({ from: weekStart.value, to: addCalendarDays(weekStart.value, 6) }))
const byDay = computed(() => new Map(groupCalendarDays(props.events, settings.timezone, range.value).map(group => [group.day, group.events])))
const week = computed(() => Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart.value, index)))
const weekdayShort = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short' })
const weekdayLong = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long' })
const dayMonth = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' })
const at = (day: string) => new Date(`${day}T00:00:00Z`)
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const count = (day: string) => byDay.value.get(day)?.length ?? 0
const label = (day: string) => `${capitalize(weekdayLong.format(at(day)))}, ${dayMonth.format(at(day))}, событий: ${count(day)}`
// До трёх разных цветов служений дня; событие церкви и служение без цвета дают один нейтральный цвет.
function colors(day: string): string[] { return [...new Set((byDay.value.get(day) ?? []).map(event => ministryColorVar(event.ministry)))].slice(0, 3) }
let start: { x: number, y: number } | null = null
function down(event: PointerEvent) { start = { x: event.clientX, y: event.clientY } }
function up(event: PointerEvent) {
  if (!start) return
  const dx = event.clientX - start.x, dy = event.clientY - start.y
  start = null
  if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) emit('shift', dx < 0 ? 1 : -1)
}
</script>

<template>
  <div class="week-strip" role="group" aria-label="Неделя">
    <div class="week-strip__days" data-test="strip-days" @pointerdown="down" @pointerup="up" @pointercancel="start = null">
      <button v-for="day in week" :key="day" type="button" class="week-strip__day" :class="{ 'is-selected': day === date, 'is-today': day === todayInChurch() }" :data-test="`strip-day-${day}`" :aria-label="label(day)" :aria-pressed="day === date" :aria-current="day === todayInChurch() ? 'date' : undefined" @click="emit('select', day)">
        <span class="week-strip__weekday" aria-hidden="true">{{ capitalize(weekdayShort.format(at(day))) }}</span>
        <span class="week-strip__number" aria-hidden="true">{{ Number(day.slice(-2)) }}</span>
        <span class="week-strip__dots" aria-hidden="true"><span v-for="color in colors(day)" :key="color" class="week-strip__dot" :style="{ background: color }" /></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.week-strip { min-width: 0; margin-top: var(--ui-space-3); container-type: inline-size; }
/* При крупном тексте дни переносятся на вторую строку, а не прокручиваются внутри полосы: каждый день остаётся на виду. */
.week-strip__days { display: grid; grid-template-columns: repeat(7, minmax(44px, 1fr)); min-width: 0; touch-action: pan-y; }
/* Семь дней по 44 px не помещаются (320 px) или подписи при крупном тексте слипаются: 4 + 3 в две строки, дни не сжимаются и не прокручиваются. */
@container (max-width: max(307px, 12rem)) { .week-strip__days { grid-template-columns: repeat(4, minmax(44px, 1fr)); } }
.week-strip__day { display: grid; justify-items: center; align-content: center; gap: 2px; min-width: 44px; min-height: 64px; padding: 4px 0; border: 1px solid transparent; border-radius: var(--ui-radius-sm); background: transparent; font-weight: 400; color: var(--ui-text); }
.week-strip__weekday { font-size: .875rem; color: var(--ui-text-muted); }
.week-strip__number { font-weight: 600; line-height: 1.25; }
.week-strip__dots { display: flex; justify-content: center; gap: 3px; min-height: 8px; }
.week-strip__dot { width: 8px; height: 8px; border-radius: 50%; }
.week-strip__day.is-today .week-strip__number { text-decoration: underline; text-underline-offset: 3px; }
.week-strip__day.is-selected { background: var(--ui-accent-soft); border-color: var(--ui-accent); }
.week-strip__day.is-selected .week-strip__weekday { color: var(--ui-text); }
</style>
