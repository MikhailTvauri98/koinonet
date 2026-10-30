<script setup lang="ts">
import type { EventItem } from '~/composables/useEvents'
import { formatCalendarDay } from '~/composables/useEvents'
import EventCard from './EventCard.vue'
defineProps<{ events: EventItem[] }>()
const { groupByChurchDay } = useEvents()
</script>

<template>
  <div class="event-list">
    <p v-if="!events.length">Событий пока нет.</p>
    <section v-for="group in groupByChurchDay(events)" :key="group.day">
      <h2><time :datetime="group.day">{{ formatCalendarDay(group.day) }}</time></h2>
      <div class="event-list__day"><EventCard v-for="event in group.events" :key="event.id" :event="event" /></div>
    </section>
  </div>
</template>

<style scoped>
.event-list__day { display: grid; gap: 0.75rem; }
</style>
