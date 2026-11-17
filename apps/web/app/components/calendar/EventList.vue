<script setup lang="ts">
import type { EventItem, EventRange } from '~/composables/useEvents'
import { formatCalendarDay, groupCalendarDays } from '~/composables/useEvents'
import EmptyState from '~/components/ui/EmptyState.vue'
import EventCard from './EventCard.vue'
// startFrom включает режим ленты телефона: дни с этой даты, заголовки по правилу дат, кнопка «Показать прошедшие»,
// выбранный день (selectedDay) виден всегда, даже пустой.
const props = withDefaults(defineProps<{ events: EventItem[], range?: EventRange, returnContext?: string, excludeDate?: string, hideDate?: boolean, emptyDescription?: string, startFrom?: string, selectedDay?: string }>(), { range: undefined, returnContext: undefined, excludeDate: undefined, emptyDescription: 'Выберите другой период, чтобы увидеть доступные события.', startFrom: undefined, selectedDay: undefined })
const { groupByChurchDay } = useEvents()
const { formatDayHeading } = useChurchDate()
const settings = useSettingsStore()
const root = ref<HTMLElement | null>(null)
const showPast = ref(false)
const feed = computed(() => props.startFrom !== undefined)
const groups = computed(() => {
  const found = (props.range ? groupCalendarDays(props.events, settings.timezone, props.range) : groupByChurchDay(props.events)).filter(group => group.day !== props.excludeDate)
  const day = props.selectedDay
  if (!feed.value || !day || !props.range || day < props.range.from || day > props.range.to || found.some(group => group.day === day)) return found
  return [...found, { day, events: [] as EventItem[] }].sort((a, b) => a.day.localeCompare(b.day))
})
const pastCount = computed(() => groups.value.filter(group => feed.value && group.day < props.startFrom! && group.events.length).length)
// Нет ни одного события в месяце: вместо пустого выбранного дня общее пустое состояние.
const nothing = computed(() => feed.value && !groups.value.some(group => group.events.length))
const visible = computed(() => nothing.value ? [] : feed.value ? groups.value.filter(group => group.day >= props.startFrom! || showPast.value) : groups.value)
const heading = (day: string) => feed.value ? formatDayHeading(day) : formatCalendarDay(day)
// Выбранный прошедший день и новый месяц: прошедшие дни раскрываются сами или сворачиваются обратно.
watch(() => [props.startFrom, props.selectedDay], () => { showPast.value = !!props.selectedDay && !!props.startFrom && props.selectedDay < props.startFrom }, { immediate: true })
// Раскрытие вставляет дни выше текущего места; положение прокрутки сохраняем по первому видимому дню.
async function revealPast() {
  const anchor = root.value?.querySelector<HTMLElement>('[data-day]')
  const before = anchor?.getBoundingClientRect().top
  showPast.value = true
  await nextTick()
  if (anchor && before !== undefined) window.scrollBy?.(0, anchor.getBoundingClientRect().top - before)
}
</script>

<template>
  <div ref="root" class="event-list">
    <button v-if="feed && !showPast && pastCount" type="button" class="ui-button event-list__past" data-test="show-past" @click="revealPast">Показать прошедшие</button>
    <p v-if="!visible.length && excludeDate" class="event-list__empty">Других событий в этом месяце нет.</p>
    <EmptyState v-else-if="!visible.length" title="Событий пока нет." :description="emptyDescription" />
    <section v-for="group in visible" :key="group.day" class="event-list__group" :class="{ 'is-selected': feed && group.day === selectedDay }" :data-day="group.day" :data-test="feed && group.day === selectedDay ? 'selected-day' : undefined" :tabindex="feed && group.day === selectedDay ? -1 : undefined">
      <h2 v-if="!hideDate"><time :datetime="group.day">{{ heading(group.day) }}</time></h2>
      <div class="event-list__day"><p v-if="!group.events.length" class="event-list__none">Событий нет</p><EventCard v-for="event in group.events" :key="event.id" :event="event" compact :day="group.day" :return-context="returnContext" /></div>
    </section>
  </div>
</template>

<style scoped>
.event-list { min-width: 0; display: grid; gap: var(--ui-space-6); container-type: inline-size; }
h2 { margin: 0 0 var(--ui-space-3); color: var(--ui-text-muted); font-size: 1rem; }
.event-list__group { scroll-margin-top: var(--ui-space-3); }
.event-list__group:focus { outline: none; }
.event-list__group:focus-visible h2 { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.event-list__day { display: grid; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); overflow: hidden; }
.event-list__empty { margin: 0; color: var(--ui-text-muted); font-size: .875rem; }
.event-list__none { margin: 0; padding: var(--ui-space-3) var(--ui-space-4); color: var(--ui-text-muted); font-size: .875rem; }
.event-list__past { justify-self: start; }
.is-selected > h2 { color: var(--ui-accent); }
</style>
