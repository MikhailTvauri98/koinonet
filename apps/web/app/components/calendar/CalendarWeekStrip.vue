<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { addCalendarDays, calendarWeekStart, groupCalendarDays } from '~/composables/useEvents'
import { ministryColorVar } from '~/utils/ministryColor'
const props = defineProps<{ date: string, events: EventItem[] }>()
const emit = defineEmits<{ select: [day: string] }>()
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
const shift = (weeks: number) => emit('select', addCalendarDays(props.date, weeks * 7))
let start: { x: number, y: number } | null = null
function down(event: PointerEvent) { start = { x: event.clientX, y: event.clientY } }
function up(event: PointerEvent) {
  if (!start) return
  const dx = event.clientX - start.x, dy = event.clientY - start.y
  start = null
  if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1)
}
</script>

<template>
  <div class="week-strip" role="group" aria-label="Неделя">
    <button type="button" class="week-strip__arrow" data-test="strip-previous" aria-label="Предыдущая неделя" @click="shift(-1)">‹</button>
    <div class="week-strip__days" data-test="strip-days" @pointerdown="down" @pointerup="up" @pointercancel="start = null">
      <button v-for="day in week" :key="day" type="button" class="week-strip__day" :class="{ 'is-selected': day === date, 'is-today': day === todayInChurch() }" :data-test="`strip-day-${day}`" :aria-label="label(day)" :aria-pressed="day === date" :aria-current="day === todayInChurch() ? 'date' : undefined" @click="emit('select', day)">
        <span class="week-strip__weekday" aria-hidden="true">{{ capitalize(weekdayShort.format(at(day))) }}</span>
        <span class="week-strip__number" aria-hidden="true">{{ Number(day.slice(-2)) }}</span>
        <span class="week-strip__dots" aria-hidden="true"><span v-for="color in colors(day)" :key="color" class="week-strip__dot" :style="{ background: color }" /></span>
      </button>
    </div>
    <button type="button" class="week-strip__arrow" data-test="strip-next" aria-label="Следующая неделя" @click="shift(1)">›</button>
  </div>
</template>

<style scoped>
.week-strip { display: flex; align-items: stretch; gap: 2px; min-width: 0; margin-top: var(--ui-space-3); }
.week-strip__arrow { flex: none; font-size: 1.5rem; min-width: 32px; min-height: 64px; padding-inline: 0; border-color: transparent; background: transparent; }
/* При крупном тексте дни переносятся на вторую строку, а не прокручиваются внутри полосы: каждый день остаётся на виду. */
.week-strip__days { flex: 1 1 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(max(30px, 1.5rem), 1fr)); min-width: 0; touch-action: pan-y; }
.week-strip__day { display: grid; justify-items: center; align-content: center; gap: 2px; min-width: 0; min-height: 64px; padding: 4px 0; border: 1px solid transparent; border-radius: var(--ui-radius-sm); background: transparent; font-weight: 400; color: var(--ui-text); }
.week-strip__weekday { font-size: .875rem; color: var(--ui-text-muted); }
.week-strip__number { font-weight: 600; line-height: 1.25; }
.week-strip__dots { display: flex; justify-content: center; gap: 3px; min-height: 8px; }
.week-strip__dot { width: 8px; height: 8px; border-radius: 50%; }
.week-strip__day.is-today .week-strip__number { text-decoration: underline; text-underline-offset: 3px; }
.week-strip__day.is-selected { background: var(--ui-accent-soft); border-color: var(--ui-accent); }
.week-strip__day.is-selected .week-strip__weekday { color: var(--ui-text); }
</style>
