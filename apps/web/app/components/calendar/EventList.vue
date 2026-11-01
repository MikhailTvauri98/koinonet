<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { formatCalendarDay } from '~/composables/useEvents'
import EmptyState from '~/components/ui/EmptyState.vue'
import EventCard from './EventCard.vue'
withDefaults(defineProps<{ events: EventItem[], emptyDescription?: string }>(), { emptyDescription: 'Выберите другой период, чтобы увидеть доступные события.' })
const { groupByChurchDay } = useEvents()
</script>

<template>
  <div class="event-list">
    <EmptyState v-if="!events.length" title="Событий пока нет." :description="emptyDescription" />
    <section v-for="group in groupByChurchDay(events)" :key="group.day">
      <h2><time :datetime="group.day">{{ formatCalendarDay(group.day) }}</time></h2>
      <div class="event-list__day"><EventCard v-for="event in group.events" :key="event.id" :event="event" /></div>
    </section>
  </div>
</template>

<style scoped>
.event-list { min-width: 0; display: grid; gap: var(--ui-space-6); }
h2 { margin: 0 0 var(--ui-space-3); color: var(--ui-text-muted); font-size: 1rem; }
.event-list__day { display: grid; gap: var(--ui-space-3); }
</style>
