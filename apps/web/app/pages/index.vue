<script setup lang="ts">
import PinnedAnnouncements from '~/components/announcements/PinnedAnnouncements.vue'
import UpcomingEvents from '~/components/calendar/UpcomingEvents.vue'
const auth = useAuthStore()
const { can } = useCan()
// Правило и обоснование — в useCan.ts (hasVisibleMinistries), общее с AppNav.vue.
const hasMinistries = useHasVisibleMinistries()
</script>

<template>
  <div class="home-page">
    <h1>Здравствуйте, {{ auth.person?.first_name }}!</h1>
    <PinnedAnnouncements />
    <UpcomingEvents />

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
