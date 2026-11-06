<script setup lang="ts">
import type { EventItem, EventRange } from '~/composables/useEvents'
import { formatCalendarDay, groupCalendarDays } from '~/composables/useEvents'
import EmptyState from '~/components/ui/EmptyState.vue'
import EventCard from './EventCard.vue'
const props = withDefaults(defineProps<{ events: EventItem[], range?: EventRange, returnContext?: string, excludeDate?: string, hideDate?: boolean, emptyDescription?: string }>(), { range: undefined, returnContext: undefined, excludeDate: undefined, emptyDescription: 'Выберите другой период, чтобы увидеть доступные события.' })
const { groupByChurchDay } = useEvents()
const settings = useSettingsStore()
const groups = computed(() => (props.range ? groupCalendarDays(props.events, settings.timezone, props.range) : groupByChurchDay(props.events)).filter(group => group.day !== props.excludeDate))
</script>

<template>
  <div class="event-list">
    <p v-if="!groups.length && excludeDate" class="event-list__empty">Других событий в этом месяце нет.</p>
    <EmptyState v-else-if="!groups.length" title="Событий пока нет." :description="emptyDescription" />
    <section v-for="group in groups" :key="group.day">
      <h2 v-if="!hideDate"><time :datetime="group.day">{{ formatCalendarDay(group.day) }}</time></h2>
      <div class="event-list__day"><EventCard v-for="event in group.events" :key="event.id" :event="event" compact :day="group.day" :return-context="returnContext" /></div>
    </section>
  </div>
</template>

<style scoped>
.event-list { min-width: 0; display: grid; gap: var(--ui-space-6); container-type: inline-size; }
h2 { margin: 0 0 var(--ui-space-3); color: var(--ui-text-muted); font-size: 1rem; }
.event-list__day { display: grid; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); }
.event-list__empty { margin: 0; color: var(--ui-text-muted); font-size: .875rem; }
.is-selected > h2 { color: var(--ui-accent); }
</style>
