<script setup lang="ts">
import PinnedAnnouncements from '~/components/announcements/PinnedAnnouncements.vue'
import UpcomingEvents from '~/components/calendar/UpcomingEvents.vue'
import UnreadChats from '~/components/chat/UnreadChats.vue'
const auth = useAuthStore()
const { can } = useCan()
// Правило и обоснование — в useCan.ts (hasVisibleMinistries), общее с AppNav.vue.
const hasMinistries = useHasVisibleMinistries()
</script>

<template>
  <div class="home-page">
    <h1>Здравствуйте, {{ auth.person?.first_name }}!</h1>
    <div class="home-page__sections"><UpcomingEvents /><div class="home-page__secondary"><PinnedAnnouncements /><UnreadChats /></div></div>

    <ul class="home-page__links">
      <li v-if="can('people.view')">
        <NuxtLink to="/people">Справочник</NuxtLink>
      </li>
      <li v-if="hasMinistries">
        <NuxtLink to="/ministries">Служения</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/settings/profile">Профиль</NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.home-page { min-width: 0; width: 100%; margin-inline: auto; overflow-wrap: anywhere; display: grid; gap: var(--ui-space-6); }
h1 { margin: 0; }
.home-page__secondary { display: grid; gap: var(--ui-space-4); align-content: start; min-width: 0; }
.home-page__sections { display: grid; gap: var(--ui-space-4); align-items: start; min-width: 0; }
.home-page :deep(.home-section) { min-width: 0; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: min(var(--ui-space-4), 16px); }
.home-page :deep(.home-section__header) { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-space-2) var(--ui-space-4); margin-bottom: var(--ui-space-3); }
.home-page :deep(.home-section__header h2) { margin: 0; font-size: 1.125rem; flex: 1 1 12rem; }
.home-page :deep(.home-section__header a) { min-height: var(--ui-control-height); display: inline-flex; align-items: center; }
.home-page :deep(.announcement-card) { margin-block: var(--ui-space-2); padding: var(--ui-space-3); box-shadow: none; background: var(--ui-surface-muted); }
.home-page__links { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); list-style: none; margin: 0; padding: 0; }
.home-page__links a { display: inline-flex; align-items: center; min-height: var(--ui-control-height); padding: var(--ui-space-2) var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); }
@media (min-width: 70rem) { .home-page__sections { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); } }
@media (max-width: 40rem) { .home-page :deep(.home-section) { padding-inline: 0; border: 0; border-top: 1px solid var(--ui-border); border-radius: 0; } }
</style>
