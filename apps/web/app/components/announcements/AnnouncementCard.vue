<script setup lang="ts">
import type { Announcement } from '~/utils/announcements'
withDefaults(defineProps<{ announcement: Announcement, headingLevel?: 2 | 3 }>(), { headingLevel: 2 })
const { formatDateTime } = useChurchDate()
</script>

<template>
  <article class="announcement-card">
    <span v-if="announcement.pinned" class="announcement-card__pin" :data-test="`pinned-${announcement.id}`">Закреплено</span>
    <component :is="`h${headingLevel}`"><NuxtLink :to="`/announcements/${encodeURIComponent(announcement.id)}`">{{ announcement.title }}</NuxtLink></component>
    <p>{{ announcement.ministry?.name ?? 'Церковь' }} · <time :datetime="announcement.published_at">{{ formatDateTime(announcement.published_at) }}</time></p>
    <p v-if="announcement.author">{{ announcement.author.full_name }}</p>
  </article>
</template>

<style scoped>
.announcement-card {
  min-width: 0;
  overflow-wrap: anywhere;
  padding: min(var(--ui-space-4), 16px);
  margin: var(--ui-space-4) 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow);
}
h2, h3 { margin: var(--ui-space-2) 0; font-size: 1.125rem; }
h2 a, h3 a { display: inline-flex; align-items: center; min-height: var(--ui-control-height); }
p { color: var(--ui-text-muted); font-size: .875rem; margin-block: var(--ui-space-2) 0; }
.announcement-card__pin { display: inline-block; background: var(--ui-accent-soft); color: var(--ui-accent); border-radius: var(--ui-radius-sm); padding: var(--ui-space-1) var(--ui-space-2); font-size: .875rem; }
</style>
