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
.announcement-card {
  min-width: 0;
  overflow-wrap: anywhere;
  padding: var(--ui-space-4);
  margin: var(--ui-space-4) 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
}
h2 { margin: var(--ui-space-2) 0; }
p { color: var(--ui-text-muted); }
</style>
