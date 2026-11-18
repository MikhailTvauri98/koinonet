<script setup lang="ts">
import type { Announcement } from '~/utils/announcements'
import { markdownToPlainText } from '~/utils/plainText'
import MinistryMark from '~/components/ui/MinistryMark.vue'
withDefaults(defineProps<{ announcement: Announcement, headingLevel?: 2 | 3 }>(), { headingLevel: 2 })
const { formatMoment } = useChurchDate()
</script>

<template>
  <article class="announcement-card">
    <span v-if="announcement.pinned" class="announcement-card__pin" :data-test="`pinned-${announcement.id}`">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d="M5 1.5h6V3l-1 1v3.2l2 2.3V10.5H8.75V15h-1.5v-4.5H3.5V9.5l2-2.3V4L4.5 3V1.5z" /></svg>
      Закреплено
    </span>
    <component :is="`h${headingLevel}`"><NuxtLink class="announcement-card__link" :to="`/announcements/${encodeURIComponent(announcement.id)}`">{{ announcement.title }}</NuxtLink></component>
    <p class="announcement-card__text">{{ markdownToPlainText(announcement.body, 240) }}</p>
    <p class="announcement-card__meta">
      <MinistryMark v-if="announcement.ministry" :ministry="announcement.ministry" />
      <time :datetime="announcement.published_at">{{ formatMoment(announcement.published_at) }}</time>
      <span v-if="announcement.author">{{ announcement.author.full_name }}</span>
    </p>
  </article>
</template>

<style scoped>
.announcement-card { position: relative; min-width: 0; overflow-wrap: anywhere; padding: var(--ui-space-3) min(var(--ui-space-4), 16px); }
.announcement-card:focus-within { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
h2, h3 { margin: var(--ui-space-1) 0; font-size: 1.125rem; }
.announcement-card__link { display: inline-flex; align-items: center; min-height: var(--ui-control-height); color: inherit; text-decoration: none; }
.announcement-card__link:hover { text-decoration: underline; }
/* Растянутая ссылка: вся строка кликабельна, ссылка одна. */
.announcement-card__link::after { content: ''; position: absolute; inset: 0; }
.announcement-card__link:focus-visible { outline: none; }
.announcement-card__pin { display: inline-flex; align-items: center; gap: var(--ui-space-1); color: var(--ui-accent); font-size: .875rem; font-weight: 600; }
.announcement-card__text { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; margin: 0; color: var(--ui-text-muted); }
.announcement-card__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-1) var(--ui-space-3); margin: var(--ui-space-1) 0 0; color: var(--ui-text-muted); font-size: .875rem; }
</style>
