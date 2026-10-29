<script setup lang="ts">
import type { Announcement } from '~/utils/announcements'
defineProps<{ announcement: Announcement }>()
const { formatDateTime } = useChurchDate()
</script>

<template>
  <article class="announcement-card">
    <span v-if="announcement.pinned" :data-test="`pinned-${announcement.id}`">Закреплено</span>
    <h2><NuxtLink :to="`/announcements/${encodeURIComponent(announcement.id)}`">{{ announcement.title }}</NuxtLink></h2>
    <p>{{ announcement.ministry?.name ?? 'Церковь' }} · <time :datetime="announcement.published_at">{{ formatDateTime(announcement.published_at) }}</time></p>
    <p v-if="announcement.author">{{ announcement.author.full_name }}</p>
  </article>
</template>

<style scoped>
.announcement-card { padding: 1rem; margin: 1rem 0; border: 1px solid #ddd; border-radius: 0.5rem; }
h2 { margin: 0.5rem 0; }
</style>
