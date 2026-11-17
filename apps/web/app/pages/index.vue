<script setup lang="ts">
import PinnedAnnouncements from '~/components/announcements/PinnedAnnouncements.vue'
import UnreadChats from '~/components/chat/UnreadChats.vue'
import MyNextAssignment from '~/components/home/MyNextAssignment.vue'
import WeekEvents from '~/components/home/WeekEvents.vue'
import { formatCalendarDay } from '~/composables/useEvents'
const auth = useAuthStore(), { todayInChurch } = useChurchDate()
const today = computed(() => todayInChurch())
</script>

<template>
  <div class="home-page">
    <header class="home-page__greeting">
      <h1>Здравствуйте, {{ auth.person?.first_name }}!</h1>
      <p class="ui-hint"><time :datetime="today">{{ formatCalendarDay(today) }}</time></p>
    </header>
    <div class="home-page__columns">
      <div class="home-page__column"><MyNextAssignment /><WeekEvents :from="today" /></div>
      <div class="home-page__column"><PinnedAnnouncements /><UnreadChats /></div>
    </div>
  </div>
</template>

<style scoped>
.home-page { min-width: 0; width: 100%; margin-inline: auto; overflow-wrap: anywhere; display: grid; gap: var(--ui-space-6); }
h1 { margin: 0; }
.home-page__greeting p { margin: var(--ui-space-1) 0 0; }
.home-page__columns { display: grid; gap: var(--ui-space-4); align-items: start; min-width: 0; }
.home-page__column { display: grid; gap: var(--ui-space-4); align-content: start; min-width: 0; }
.home-page :deep(.home-section) { min-width: 0; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: min(var(--ui-space-4), 16px); }
.home-page :deep(.home-section__header) { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-space-2) var(--ui-space-4); margin-bottom: var(--ui-space-3); }
.home-page :deep(.home-section__header h2) { margin: 0; font-size: 1.125rem; flex: 1 1 8rem; }
.home-page :deep(.home-section__header a:not(.ui-button)) { min-height: var(--ui-control-height); display: inline-flex; align-items: center; }
@media (min-width: 70rem) { .home-page__columns { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); } }
@media (max-width: 40rem) { .home-page :deep(.home-section) { padding-inline: 0; border: 0; border-top: 1px solid var(--ui-border); border-radius: 0; } }
</style>
